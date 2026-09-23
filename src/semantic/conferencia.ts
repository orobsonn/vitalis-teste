/**
 * Conferência central de uma guia (§3.6/§3.7/§3.9).
 *
 * Único caminho compartilhado por web, MCP e Skill: compõe o motor determinístico
 * (`verificarGuia`) com a extração semântica cacheada, quota best-effort,
 * timeout por tentativa, no máximo uma retentativa transitória, validação fechada
 * da resposta e entrega textual ao motor.
 *
 * Garantias do contrato:
 * - Observação vazia após `trim` sai pelo motor puro (`nao_aplicavel`), sem
 *   cache, sem quota e sem inferência; o texto CRU é preservado na chave e no
 *   payload, e o `trim` serve apenas para vazio e limites.
 * - Limites de entrada (1000 caracteres de observação, 200 de convênio e de
 *   procedimento, após `trim`) são checados antes de qualquer leitura de cache
 *   ou chamada.
 * - Cache miss/hit, quota antes de cada tentativa, timeout real por tentativa
 *   (`setTimeout`), retentativa apenas para falha `transporte` (429/5xx),
 *   resposta acima de 16 KiB rejeitada antes do parse e gravação best-effort.
 * - Falha fechada: erro, timeout, configuração ausente, schema/evidência/limite,
 *   quota e observação acima do teto produzem `incompleta` com os achados
 *   determinísticos preservados; `inferencia_textual` só é nula sem tentativa.
 * - Nenhum `console.*`; eventos apenas pelo `RegistradorRedigido` com o
 *   vocabulário fechado e campos da allowlist.
 */

import type { Catalogo } from "../domain/catalogo";
import type { DataCivil } from "../domain/datas";
import { verificarGuia } from "../domain/motor";
import type { ResultadoVerificacao } from "../domain/motor";
import type { GuiaNormalizada } from "../domain/normalizacao";
import type { TextualValidado } from "../domain/policies/textuais";

import { montarChaveCacheSemantica } from "./cache";
import type { AdaptadorCacheSemantico, ContextoChaveCacheSemantica } from "./cache";
import type {
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
  SinaisObservacao,
} from "./contratos";
import type { ClassificacaoEstavel, RegistradorRedigido } from "./observabilidade";
import { PROMPT_HASH, versaoEfetivaDoPrompt } from "./prompt";
import type { ObservadorContadores, QuotaDeChamadas } from "./quota";
import { validarExtracao } from "./validacao";
import { MODELO_OBSERVACAO } from "./workers-ai";

/** Teto de caracteres da observação após `trim` (§3.9). */
export const LIMITE_OBSERVACAO = 1000;
/** Teto de caracteres de convênio e de procedimento após `trim` (§3.9). */
export const LIMITE_CONTEXTO = 200;
/** Teto, em bytes UTF-8, da resposta serializada do provedor (§3.9). */
export const LIMITE_RESPOSTA_BYTES = 16 * 1024;
/** Timeout padrão por tentativa, em milissegundos (§3.9). */
export const TIMEOUT_PADRAO_MS = 5000;
/** Número máximo de tentativas por conferência: original + uma retentativa. */
export const MAXIMO_TENTATIVAS = 2;

/** Limitação nomeada da observação acima do teto de entrada (§3.9). */
export const LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE = "observacao_acima_do_limite";
/** Limitação nomeada da quota excedida, resolvida nesta tarefa a partir de §3.9. */
export const LIMITACAO_QUOTA_EXCEDIDA = "quota_de_chamadas_excedida";

/** Classificação fechada de uma falha de extração (§3.9). */
export type ClassificacaoFalha =
  | "transporte"
  | "timeout"
  | "configuracao"
  | "schema_invalido"
  | "evidencia_invalida"
  | "limite_excedido"
  | "nao_transitorio";

/** Opções injetáveis da conferência central (§3.7). */
export interface OpcoesConferencia {
  /** Referência temporal repassada ao motor. */
  referenciaTemporal?: DataCivil;
  /** Interpretador injetado; ausente/null ⇒ sem tentativa. */
  interpretador?: InterpretadorObservacao | null;
  /** Adaptador real sobre KV; ausente/null ⇒ sem cache. */
  cache?: AdaptadorCacheSemantico | null;
  /** Quota consumida antes de cada tentativa. */
  quota?: QuotaDeChamadas | null;
  /** Registrador redigido dos eventos da allowlist. */
  registrador?: RegistradorRedigido;
  /** Observador dos contadores de operação. */
  observador?: ObservadorContadores;
  /** Timeout por tentativa em ms; padrão `TIMEOUT_PADRAO_MS`. */
  timeoutMs?: number;
  /** Relógio injetável para durações observáveis; padrão `Date.now`. */
  agora?: () => number;
  /** Classificador fechado de falha; padrão trata 429/5xx como `transporte`. */
  classificarFalha?: (erro: unknown) => ClassificacaoFalha;
}

const CODIFICADOR = new TextEncoder();

/** Comprimento em bytes UTF-8 do texto serializado da resposta. */
function bytesDoTexto(texto: string): number {
  return CODIFICADOR.encode(texto).length;
}

/** Lê `status` numérico de um erro desconhecido sem lançar. */
function statusDoErro(erro: unknown): number | null {
  if (typeof erro === "object" && erro !== null) {
    const status = (erro as { status?: unknown }).status;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  }
  return null;
}

/** Classificador padrão fechado: só `status === 429` ou `status >= 500` retenta. */
function classificarPadrao(erro: unknown): ClassificacaoFalha {
  const status = statusDoErro(erro);
  if (status === 429 || (status !== null && status >= 500)) {
    return "transporte";
  }
  return "nao_transitorio";
}

/** Normaliza o timeout: só número finito positivo; qualquer outra forma usa o padrão. */
function normalizarTimeout(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? valor
    : TIMEOUT_PADRAO_MS;
}

/** Código estável de observabilidade para uma classificação de falha (§3.10). */
function codigoDaClassificacao(classificacao: ClassificacaoFalha): ClassificacaoEstavel | null {
  switch (classificacao) {
    case "transporte":
      return "erro_transporte";
    case "timeout":
      return "timeout";
    case "schema_invalido":
      return "schema_invalido";
    case "evidencia_invalida":
      return "evidencia_invalida";
    case "limite_excedido":
      return "limite_excedido";
    case "configuracao":
    case "nao_transitorio":
      return null;
  }
}

/** Código estável para uma recusa da validação de extração (§3.10). */
function codigoDaValidacao(erro: string): ClassificacaoEstavel {
  if (erro === "evidencia_invalida") {
    return "evidencia_invalida";
  }
  if (erro === "limite_excedido") {
    return "limite_excedido";
  }
  return "schema_invalido";
}

/** Identidade de inferência e de cache, sempre derivada da configuração. */
function contextoDaConfiguracao(): ContextoChaveCacheSemantica {
  return {
    modelo: MODELO_OBSERVACAO,
    promptVersao: versaoEfetivaDoPrompt(),
    promptHash: PROMPT_HASH,
  };
}

type ResultadoTentativa =
  | { tipo: "ok"; resposta: RespostaBruta }
  | { tipo: "timeout" }
  | { tipo: "erro"; erro: unknown };

/**
 * Executa uma tentativa de extração com timeout real por `setTimeout`. A
 * tentativa abandonada por timeout nunca dispara nova chamada: o resultado do
 * timeout vence a corrida e a promessa em voo é descartada sem sobreposição.
 */
function tentarExtracao(
  interpretador: InterpretadorObservacao,
  entrada: EntradaObservacao,
  timeoutMs: number,
): Promise<ResultadoTentativa> {
  return new Promise<ResultadoTentativa>((resolve) => {
    let concluido = false;

    const temporizador = setTimeout(() => {
      if (!concluido) {
        concluido = true;
        resolve({ tipo: "timeout" });
      }
    }, timeoutMs);

    const finalizar = (resultado: ResultadoTentativa): void => {
      if (concluido) {
        return;
      }
      concluido = true;
      clearTimeout(temporizador);
      resolve(resultado);
    };

    let promessa: Promise<RespostaBruta>;
    try {
      promessa = interpretador.extrair(entrada);
    } catch (erro) {
      finalizar({ tipo: "erro", erro });
      return;
    }

    promessa.then(
      (resposta) => finalizar({ tipo: "ok", resposta }),
      (erro: unknown) => finalizar({ tipo: "erro", erro }),
    );
  });
}

/**
 * Conferência central de uma guia: vazio pelo motor puro; não vazio por limites,
 * cache, quota, extração com timeout/retentativa, validação e entrega ao motor.
 */
export async function conferirGuia(
  guia: GuiaNormalizada,
  catalogo: Catalogo,
  opcoes: OpcoesConferencia = {},
): Promise<ResultadoVerificacao> {
  const referenciaTemporal = opcoes.referenciaTemporal;
  const registrador = opcoes.registrador;
  const observador = opcoes.observador;
  const agora = opcoes.agora ?? Date.now;
  const inicio = agora();
  let tentativas = 0;

  // 1. Observação vazia após `trim`: motor puro, sem cache, quota ou inferência.
  if (guia.observacaoRecepcao.trim() === "") {
    const resultado = verificarGuia(guia, catalogo, { referenciaTemporal });
    registrador?.info("conferencia_concluida", {
      estado: "nao_aplicavel",
      duracao_ms: Math.max(0, agora() - inicio),
      tentativas: 0,
    });
    return resultado;
  }

  const entrada: EntradaObservacao = {
    observacao_recepcao: guia.observacaoRecepcao,
    convenio: guia.convenio,
    procedimento_codigo: guia.procedimentoCodigo,
  };
  const contexto = contextoDaConfiguracao();

  const concluir = (
    textual: TextualValidado,
    extras: {
      estado: "completa" | "incompleta";
      limitacoes?: string[];
      codigo?: ClassificacaoEstavel;
    },
  ): ResultadoVerificacao => {
    const resultado = verificarGuia(guia, catalogo, { referenciaTemporal, textual });
    for (const limitacao of extras.limitacoes ?? []) {
      if (!resultado.limitacoes.includes(limitacao)) {
        resultado.limitacoes.push(limitacao);
      }
    }
    const duracao_ms = Math.max(0, agora() - inicio);
    if (extras.estado === "incompleta") {
      registrador?.info("conferencia_falhou", {
        estado: "incompleta",
        ...(extras.codigo ? { codigo: extras.codigo } : {}),
        duracao_ms,
        tentativas,
      });
    } else {
      registrador?.info("conferencia_concluida", {
        estado: "completa",
        duracao_ms,
        tentativas,
      });
    }
    return resultado;
  };

  // 2. Limites de entrada antes de qualquer cache ou chamada.
  if (guia.observacaoRecepcao.trim().length > LIMITE_OBSERVACAO) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      {
        estado: "incompleta",
        limitacoes: [LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE],
        codigo: "limite_excedido",
      },
    );
  }
  if (
    guia.convenio.trim().length > LIMITE_CONTEXTO ||
    guia.procedimentoCodigo.trim().length > LIMITE_CONTEXTO
  ) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta", codigo: "limite_excedido" },
    );
  }

  // 3. Cache semântico: hit válido entrega `completa` sem modelo nem quota.
  const cache = opcoes.cache ?? null;
  if (cache) {
    let sinais: SinaisObservacao | null = null;
    try {
      sinais = await cache.ler(entrada, contexto);
    } catch {
      sinais = null;
      registrador?.info("cache_leitura_falhou", {
        estado: "incompleta",
        codigo: "cache_indisponivel",
        cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
      });
    }
    if (sinais) {
      observador?.registrarCacheHit();
      return concluir(
        {
          estado: "completa",
          sinais,
          modelo: contexto.modelo,
          prompt_versao: contexto.promptVersao,
        },
        { estado: "completa" },
      );
    }
  }

  // 4. Configuração ausente: sem tentativa e sem identidade de inferência.
  const interpretador = opcoes.interpretador ?? null;
  if (!interpretador) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta" },
    );
  }

  const classificar = opcoes.classificarFalha ?? classificarPadrao;
  const timeoutMs = normalizarTimeout(opcoes.timeoutMs);
  const quota = opcoes.quota ?? null;

  // 5. Tentativas estritamente sequenciais, com no máximo uma retentativa.
  for (;;) {
    if (quota && !quota.consumir()) {
      return concluir(
        tentativas > 0
          ? {
              estado: "incompleta",
              sinais: null,
              modelo: contexto.modelo,
              prompt_versao: contexto.promptVersao,
            }
          : { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
        {
          estado: "incompleta",
          limitacoes: [LIMITACAO_QUOTA_EXCEDIDA],
          codigo: "quota_excedida",
        },
      );
    }

    observador?.registrarChamada();
    tentativas += 1;
    registrador?.info("extracao_iniciada", { tentativas });

    const tentativa = await tentarExtracao(interpretador, entrada, timeoutMs);

    if (tentativa.tipo === "ok") {
      const resposta = tentativa.resposta;

      // Teto de saída antes do parse.
      if (bytesDoTexto(resposta.texto) > LIMITE_RESPOSTA_BYTES) {
        registrador?.info("extracao_falhou", {
          estado: "incompleta",
          codigo: "limite_excedido",
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta", codigo: "limite_excedido" },
        );
      }

      const validacao = validarExtracao(resposta.texto, entrada.observacao_recepcao);
      if (!validacao.ok) {
        const codigo = codigoDaValidacao(validacao.erro);
        registrador?.info("extracao_falhou", {
          estado: "incompleta",
          codigo,
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta", codigo },
        );
      }

      // Gravação best-effort: falha de KV não fecha a guia.
      if (cache) {
        try {
          await cache.gravar(entrada, contexto, validacao.sinais);
        } catch {
          registrador?.info("cache_gravacao_falhou", {
            estado: "incompleta",
            codigo: "cache_indisponivel",
            cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
          });
        }
      }

      registrador?.info("extracao_concluida", {
        estado: "completa",
        itens: validacao.sinais.sinais.length,
        tentativas,
      });
      return concluir(
        {
          estado: "completa",
          sinais: validacao.sinais,
          modelo: contexto.modelo,
          prompt_versao: contexto.promptVersao,
        },
        { estado: "completa" },
      );
    }

    const classificacao =
      tentativa.tipo === "timeout" ? "timeout" : classificar(tentativa.erro);
    const codigoFalha = codigoDaClassificacao(classificacao);
    registrador?.info("extracao_falhou", {
      estado: "incompleta",
      ...(codigoFalha ? { codigo: codigoFalha } : {}),
      tentativas,
    });

    if (classificacao === "transporte" && tentativas < MAXIMO_TENTATIVAS) {
      continue;
    }

    return concluir(
      {
        estado: "incompleta",
        sinais: null,
        modelo: contexto.modelo,
        prompt_versao: contexto.promptVersao,
      },
      { estado: "incompleta", ...(codigoFalha ? { codigo: codigoFalha } : {}) },
    );
  }
}
