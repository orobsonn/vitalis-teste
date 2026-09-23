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
 * - ÚNICOS limites de entrada são os TRIMADOS (1000 observação, 200 contexto);
 *   o texto CRU é preservado sem teto de caracteres crus. O risco residual de
 *   custo/corpo cru pertence ao limite de corpo do entrypoint HTTP
 *   (issues #4/#6), não a este contrato.
 * - Quota antes de cada tentativa, com uma ÚNICA instância padrão do isolate
 *   (60/60000 ms) usada quando a quota é omitida ou `null`.
 * - Cache miss/hit, timeout real por tentativa
 *   (`setTimeout`), retentativa apenas para falha `transporte` com `status`
 *   transitório PRÓPRIO do erro (429/5xx),
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
import type {
  CamposPermitidos,
  ClassificacaoEstavel,
  RegistradorRedigido,
} from "./observabilidade";
import { PROMPT_HASH, versaoEfetivaDoPrompt } from "./prompt";
import { criarQuotaDeChamadas } from "./quota";
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

/**
 * Quota padrão do isolate (§3.9): UMA única instância criada no carregamento do
 * módulo (60 chamadas / 60000 ms) e compartilhada por toda `conferirGuia` que
 * não receba quota injetada. Nunca é criada por chamada.
 */
const QUOTA_PADRAO = criarQuotaDeChamadas();

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
  /** Modelo fixado por configuração; padrão `MODELO_OBSERVACAO`. */
  modelo?: string;
  /** Timeout por tentativa em ms; padrão `TIMEOUT_PADRAO_MS`. */
  timeoutMs?: number;
  /**
   * Limite temporal, em ms, de ESPERA de CADA operação de cache (leitura E
   * gravação); padrão `TIMEOUT_PADRAO_MS`. O limite cerca a ESPERA, não o efeito
   * de armazenamento: um cache que não responda dentro do prazo degrada a
   * leitura para miss e ABANDONA a gravação — a conferência não a aguarda,
   * conclui `completa` e emite o evento redigido `cache_gravacao_falhou`; uma
   * conclusão tardia da gravação ainda pode persistir best-effort, sem alterar
   * o resultado devolvido nem o evento emitido. Nada disso vira falha da
   * conferência. Normalizado como o timeout por tentativa: só número finito
   * positivo vale; qualquer outra forma usa o padrão.
   */
  timeoutCacheMs?: number;
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

/**
 * Lê `status` numérico de um erro desconhecido sem lançar nem avaliar
 * acessores arbitrários: só a propriedade própria de dado é lida, e qualquer
 * exceção (inclusive de um `Proxy`) na obtenção fecha como sem status.
 */
function statusDoErro(erro: unknown): number | null {
  if (typeof erro !== "object" || erro === null) {
    return null;
  }
  try {
    const descritor = Object.getOwnPropertyDescriptor(erro, "status");
    const status = descritor && "value" in descritor ? descritor.value : undefined;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  } catch {
    return null;
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

/**
 * Só o `status` transitório PRÓPRIO do erro (429 ou ≥500) autoriza a
 * retentativa; usa a mesma leitura guardada de `statusDoErro` (propriedade
 * própria de dado, sem avaliar acessores arbitrários).
 */
function statusTransitorio(erro: unknown): boolean {
  const status = statusDoErro(erro);
  return status === 429 || (status !== null && status >= 500);
}

/** Normaliza o timeout: só número finito positivo; qualquer outra forma usa o padrão. */
function normalizarTimeout(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? valor
    : TIMEOUT_PADRAO_MS;
}

/**
 * Leitura best-effort do relógio: `agora()` alimenta APENAS a telemetria de
 * `duracao_ms`. Um relógio que lance ou devolva valor não finito degrada para
 * `null` sem nunca rejeitar a conferência nem alterar decisões, chamadas,
 * cache, quota ou resultado; só a duração telemetrável se perde.
 */
function lerRelogio(agora: () => number): number | null {
  try {
    const instante = agora();
    return typeof instante === "number" && Number.isFinite(instante) ? instante : null;
  } catch {
    return null;
  }
}

/**
 * Duração telemetrável entre dois instantes válidos. Devolve `undefined`
 * quando qualquer leitura falha ou é não finita, para que o campo `duracao_ms`
 * seja OMITIDO do evento em vez de emitir `NaN` ou uma duração fictícia.
 */
function medirDuracao(inicio: number | null, agora: () => number): number | undefined {
  if (inicio === null) {
    return undefined;
  }
  const fim = lerRelogio(agora);
  return fim === null ? undefined : Math.max(0, fim - inicio);
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

/**
 * Modelo efetivo da configuração: só uma string não vazia após `trim` é
 * aceita (preservada literalmente, para conferir com a identidade devolvida
 * pelo provedor); qualquer outra forma (`undefined`, vazia, whitespace ou
 * não-string) recai no padrão `MODELO_OBSERVACAO`, nunca numa identidade vazia.
 */
function normalizarModelo(valor: unknown): string {
  return typeof valor === "string" && valor.trim() !== "" ? valor : MODELO_OBSERVACAO;
}

/** Identidade de inferência e de cache, sempre derivada da configuração. */
function contextoDaConfiguracao(modelo: string): ContextoChaveCacheSemantica {
  return {
    modelo,
    promptVersao: versaoEfetivaDoPrompt(),
    promptHash: PROMPT_HASH,
  };
}

/**
 * Emissão best-effort de um evento redigido: TODA a emissão da conferência
 * passa por aqui. Um `RegistradorRedigido` hostil que lance em `info` nunca
 * rejeita a Promise de `conferirGuia` — a exceção é engolida e o evento (ou a
 * falha) permanece descrito pelo `ResultadoVerificacao` devolvido. O nome e os
 * campos de cada evento continuam idênticos; muda apenas o modo de falha.
 */
function emitir(
  registrador: RegistradorRedigido | undefined,
  evento: string,
  campos: CamposPermitidos,
): void {
  try {
    registrador?.info(evento, campos);
  } catch {
    // Logging best-effort: falha do destino nunca vira falha da conferência.
  }
}

/**
 * Notificação best-effort do observador de contadores: TODA notificação da
 * conferência passa por aqui. Um `ObservadorContadores` hostil que lance nunca
 * rejeita a Promise de `conferirGuia` — a exceção é engolida e nenhuma decisão
 * muda (chamadas ao modelo, consumo de quota, leitura/gravação de cache e
 * resultado permanecem idênticos); só a telemetria falha em silêncio. Nunca
 * `console.*`.
 */
function notificarObservador(
  observador: ObservadorContadores | undefined,
  notificar: (observador: ObservadorContadores) => void,
): void {
  if (!observador) {
    return;
  }
  try {
    notificar(observador);
  } catch {
    // Telemetria best-effort: falha do observador nunca vira falha da conferência.
  }
}

/**
 * A resposta só é aceita quando o provedor confirma a identidade configurada
 * (`modelo` e versão efetiva do prompt); uma resposta de outra identidade é
 * tratada como `configuracao` (sem código estável) e nunca é cacheada.
 */
function identidadeConfere(
  resposta: RespostaBruta,
  contexto: ContextoChaveCacheSemantica,
): boolean {
  return resposta.modelo === contexto.modelo && resposta.promptVersao === contexto.promptVersao;
}

/**
 * Leitura guardada do marcador `notificaRecusaNoObservador`: só o primitivo
 * `true` significa que a quota JÁ se auto-reporta; um acessor (ou `Proxy`) que
 * lance, o marcador ausente e qualquer outro valor recaem em "a quota NÃO se
 * auto-reporta", de modo que a orquestração conta a recusa pelo próprio
 * observador sem nunca rejeitar `conferirGuia`. A proveniência do marcador
 * (booleano público forjável) é uma limitação da quota dona; aqui, um marcador
 * desconhecido ou forjado apenas cai na notificação do lado da conferência.
 */
function quotaSeAutoReporta(quota: QuotaDeChamadas): boolean {
  try {
    return quota.notificaRecusaNoObservador === true;
  } catch {
    return false;
  }
}

/** Classifica a falha de uma tentativa sem deixar exceção escapar (fecha como não transitória). */
function classificarFalhaComGuarda(
  classificar: (erro: unknown) => ClassificacaoFalha,
  erro: unknown,
): ClassificacaoFalha {
  try {
    return classificar(erro);
  } catch {
    return "nao_transitorio";
  }
}

type ResultadoTentativa =
  | { tipo: "ok"; resposta: RespostaBruta }
  | { tipo: "timeout" }
  | { tipo: "erro"; erro: unknown };

type ResultadoCorrida<T> =
  | { tipo: "ok"; valor: T }
  | { tipo: "timeout" }
  | { tipo: "erro"; erro: unknown };

/**
 * Corrida limitada por `setTimeout`, mecanismo ÚNICO compartilhado por cada
 * tentativa de extração e por cada operação de cache (leitura E gravação).
 * Uma promessa que nunca resolve é abandonada quando o prazo vence: o timeout
 * ganha a corrida e a promessa em voo é descartada sem sobreposição, sem
 * lançar e sem bloquear a conferência. Uma rejeição também é convertida em
 * resultado fechado, nunca em exceção de `conferirGuia`.
 */
function correrComTimeout<T>(
  iniciar: () => Promise<T>,
  timeoutMs: number,
): Promise<ResultadoCorrida<T>> {
  return new Promise<ResultadoCorrida<T>>((resolve) => {
    let concluido = false;

    const temporizador = setTimeout(() => {
      if (!concluido) {
        concluido = true;
        resolve({ tipo: "timeout" });
      }
    }, timeoutMs);

    const finalizar = (resultado: ResultadoCorrida<T>): void => {
      if (concluido) {
        return;
      }
      concluido = true;
      clearTimeout(temporizador);
      resolve(resultado);
    };

    let promessa: Promise<T>;
    try {
      // Assimilação normalizada: um adaptador estrutural que devolva um
      // não-Promise (ou um thenable hostil) resolve/rejeita a promessa
      // normalizada em vez de lançar de forma síncrona para fora da corrida.
      // `Promise.resolve` nunca lança por um `then` acessor que falhe: o erro
      // vira rejeição da promessa devolvida e é mapeado em resultado fechado.
      promessa = Promise.resolve(iniciar());
    } catch (erro) {
      finalizar({ tipo: "erro", erro });
      return;
    }

    promessa.then(
      (valor) => finalizar({ tipo: "ok", valor }),
      (erro: unknown) => finalizar({ tipo: "erro", erro }),
    );
  });
}

/**
 * Executa uma tentativa de extração com timeout real por `setTimeout`. A
 * tentativa abandonada por timeout nunca dispara nova chamada: o resultado do
 * timeout vence a corrida e a promessa em voo é descartada sem sobreposição.
 */
async function tentarExtracao(
  interpretador: InterpretadorObservacao,
  entrada: EntradaObservacao,
  timeoutMs: number,
): Promise<ResultadoTentativa> {
  const corrida = await correrComTimeout<RespostaBruta>(
    () => interpretador.extrair(entrada),
    timeoutMs,
  );
  if (corrida.tipo === "ok") {
    return { tipo: "ok", resposta: corrida.valor };
  }
  if (corrida.tipo === "timeout") {
    return { tipo: "timeout" };
  }
  return { tipo: "erro", erro: corrida.erro };
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
  const inicio = lerRelogio(agora);
  let tentativas = 0;

  // 1. Observação vazia após `trim`: motor puro, sem cache, quota ou inferência.
  if (guia.observacaoRecepcao.trim() === "") {
    const resultado = verificarGuia(guia, catalogo, { referenciaTemporal });
    const duracao = medirDuracao(inicio, agora);
    emitir(registrador, "conferencia_concluida", {
      estado: "nao_aplicavel",
      ...(duracao === undefined ? {} : { duracao_ms: duracao }),
      tentativas: 0,
    });
    return resultado;
  }

  const entrada: EntradaObservacao = {
    observacao_recepcao: guia.observacaoRecepcao,
    convenio: guia.convenio,
    procedimento_codigo: guia.procedimentoCodigo,
  };
  const contexto = contextoDaConfiguracao(normalizarModelo(opcoes.modelo));

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
    const duracao = medirDuracao(inicio, agora);
    if (extras.estado === "incompleta") {
      emitir(registrador, "conferencia_falhou", {
        estado: "incompleta",
        ...(extras.codigo ? { codigo: extras.codigo } : {}),
        ...(duracao === undefined ? {} : { duracao_ms: duracao }),
        tentativas,
      });
    } else {
      emitir(registrador, "conferencia_concluida", {
        estado: "completa",
        ...(duracao === undefined ? {} : { duracao_ms: duracao }),
        tentativas,
      });
    }
    return resultado;
  };

  // 2. Limites semânticos de entrada (após `trim`), ainda sem cache ou chamada.
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
  // Cada operação de cache (leitura E gravação) corre sob o MESMO limite
  // temporal configurável, com o mesmo mecanismo de corrida por `setTimeout`
  // das tentativas: um KV que aceita a chamada e nunca resolve degrada a
  // leitura para miss e ABANDONA a gravação. O limite cerca a ESPERA, não o
  // efeito de armazenamento: a conferência não aguarda a gravação abandonada,
  // conclui `completa` e emite `cache_gravacao_falhou`, e uma conclusão tardia
  // ainda pode persistir best-effort sem alterar o resultado devolvido nem o
  // evento emitido. Nada aqui trava nem rejeita a conferência.
  const timeoutCacheMs = normalizarTimeout(opcoes.timeoutCacheMs);
  const cache = opcoes.cache ?? null;
  if (cache) {
    let sinais: SinaisObservacao | null = null;
    const leitura = await correrComTimeout<SinaisObservacao | null>(
      () => cache.ler(entrada, contexto),
      timeoutCacheMs,
    );
    if (leitura.tipo === "ok") {
      // §3.8: a MESMA validação de schema/evidência da extração vale para o
      // valor LIDO do cache. Um adaptador estrutural pode RESOLVER uma Promise
      // legítima com um valor truthy que NÃO é `SinaisObservacao`; a truthiness
      // sozinha não pode selecionar o hit. `validarExtracao` aceita o objeto já
      // parseado: só `{ ok: true, sinais }` é hit válido. Um valor
      // inválido/null/malformado — ou um acessor hostil que lance durante a
      // validação — degrada em silêncio para MISS, como a entrada corrompida do
      // adaptador (sem evento de falha); o fluxo segue para a extração, de modo
      // que a conferência nunca rejeita nem deixa um erro de acesso a
      // propriedade escapar.
      try {
        const validacaoCache = validarExtracao(leitura.valor, entrada.observacao_recepcao);
        sinais = validacaoCache.ok ? validacaoCache.sinais : null;
      } catch {
        sinais = null;
      }
    } else {
      sinais = null;
      emitir(registrador, "cache_leitura_falhou", {
        estado: "incompleta",
        codigo: "cache_indisponivel",
        cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
      });
    }
    if (sinais) {
      notificarObservador(observador, (o) => o.registrarCacheHit());
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
  // Quota: injetada quando presente; ausente OU `null` usa a instância padrão
  // do isolate (nunca uma nova instância por chamada).
  const quota = opcoes.quota ?? QUOTA_PADRAO;

  // 5. Tentativas estritamente sequenciais, com no máximo uma retentativa.
  for (;;) {
    // Quota consultada sob guarda: um `consumir()` que lance (por exemplo, um
    // observador hostil injetado na quota) é tratado como recusa fechada e cai
    // no MESMO caminho de recusa abaixo — a exceção nunca escapa da conferência
    // nem pula o evento, a contagem e o resultado `incompleta`. O flag distingue
    // o `false` normal da exceção: só o `false` normal pode confiar no marcador
    // de auto-reporte da quota.
    let quotaAutorizou = true;
    let quotaConsumiuLancou = false;
    if (quota) {
      try {
        quotaAutorizou = quota.consumir();
      } catch {
        quotaAutorizou = false;
        quotaConsumiuLancou = true;
      }
    }
    if (!quotaAutorizou) {
      // Contagem única da recusa: quando a quota JÁ se auto-reporta ao
      // observador (`notificaRecusaNoObservador === true`), a orquestração não
      // conta de novo; só quotas sem esse marcador (plain/fake, sem observador,
      // ou com marcador forjado/ilegível) são contadas aqui. A leitura é sempre
      // guardada por `quotaSeAutoReporta`: um acessor que lance NUNCA rejeita a
      // conferência nem pula o evento/contagem. Um `consumir()` que LANÇOU nunca
      // confia no marcador: a quota pode não ter reportado antes de lançar, então
      // a conferência sempre notifica nesse caso (um throw posterior a um report
      // bem-sucedido, no pior caso, conta duas vezes — direção fechada e
      // indetectável a partir de `consumir(): boolean`). Em ambos os casos emite
      // exatamente um `quota_recusada` — antes de `registrarChamada()` e de
      // qualquer envio — e retorna imediatamente, sem segunda contagem.
      if (quotaConsumiuLancou || !quotaSeAutoReporta(quota)) {
        notificarObservador(observador, (o) => o.registrarRecusaQuota());
      }
      emitir(registrador, "quota_recusada", {
        estado: "incompleta",
        codigo: "quota_excedida",
        tentativas,
      });
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

    notificarObservador(observador, (o) => o.registrarChamada());
    tentativas += 1;
    emitir(registrador, "extracao_iniciada", { tentativas });

    const tentativa = await tentarExtracao(interpretador, entrada, timeoutMs);

    if (tentativa.tipo === "ok") {
      const resposta = tentativa.resposta;

      // Identidade efetiva do provedor: só a configurada é aceita. Mismatch
      // fecha sem gravar cache, sem retentar e sem relabelar como padrão.
      if (!identidadeConfere(resposta, contexto)) {
        emitir(registrador, "extracao_falhou", {
          estado: "incompleta",
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: resposta.modelo,
            prompt_versao: resposta.promptVersao,
          },
          { estado: "incompleta" },
        );
      }

      // Teto de saída antes do parse.
      if (bytesDoTexto(resposta.texto) > LIMITE_RESPOSTA_BYTES) {
        emitir(registrador, "extracao_falhou", {
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
        emitir(registrador, "extracao_falhou", {
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

      // Gravação best-effort: falha de KV não fecha a guia. O limite temporal
      // cerca a ESPERA, não o efeito de armazenamento: uma gravação expirada
      // (ou rejeitada) é ABANDONADA — a conferência não a aguarda, emite
      // `cache_gravacao_falhou` e o resultado validado segue `completa`; uma
      // conclusão tardia ainda pode persistir best-effort, sem alterar o
      // resultado devolvido nem o evento emitido.
      if (cache) {
        const gravacao = await correrComTimeout<void>(
          () => cache.gravar(entrada, contexto, validacao.sinais),
          timeoutCacheMs,
        );
        if (gravacao.tipo !== "ok") {
          emitir(registrador, "cache_gravacao_falhou", {
            estado: "incompleta",
            codigo: "cache_indisponivel",
            cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
          });
        }
      }

      emitir(registrador, "extracao_concluida", {
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
      tentativa.tipo === "timeout"
        ? "timeout"
        : classificarFalhaComGuarda(classificar, tentativa.erro);
    const codigoFalha = codigoDaClassificacao(classificacao);
    emitir(registrador, "extracao_falhou", {
      estado: "incompleta",
      ...(codigoFalha ? { codigo: codigoFalha } : {}),
      tentativas,
    });

    // Retentativa exige a classificação `transporte` E o `status` transitório
    // PRÓPRIO do erro (429 ou ≥500): o classificador injetado continua
    // autoritativo na direção negativa, mas não autoriza sozinho a retentativa.
    if (
      classificacao === "transporte" &&
      tentativa.tipo === "erro" &&
      statusTransitorio(tentativa.erro) &&
      tentativas < MAXIMO_TENTATIVAS
    ) {
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
