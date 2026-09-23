/**
 * Cache semântico versionado sobre KV dedicado `CACHE_SEMANTICO` (§3.8).
 *
 * Responsabilidade única: derivar a chave `semantico:v1:` a partir do JSON
 * canônico dos campos que decidem a interpretação e guardar/ler a resposta
 * **já validada** (`SinaisObservacao`). Não há timeout, retentativa nem quota
 * aqui — essas políticas pertencem às camadas de orquestração. As únicas
 * observações emitidas são os eventos redigidos
 * `cache_leitura_falhou`/`cache_gravacao_falhou` (§3.10), limitados a estado,
 * código e prefixo da chave.
 *
 * Garantias do contrato (§3.8, §3.1, §3.10):
 * - A chave é o `sha256` do JSON canônico de
 *   `{ texto, convenio, procedimento_codigo, prompt_versao, prompt_hash, modelo }`,
 *   de modo que trocar o modelo, a constante de versão ou o **conteúdo** do
 *   prompt (via `prompt_hash`) invalida a entrada.
 * - Toda leitura passa pela mesma validação de schema/evidência da extração:
 *   valor ilegível, fora do schema ou com evidência não literal é **miss**
 *   (descartável e sobrescrevível), nunca erro fatal.
 * - Falha de leitura **ou** de gravação no KV nunca fecha a guia: a leitura
 *   degrada para miss, a gravação segue sem persistir. Nenhuma exceção isolada
 *   do adaptador propaga.
 * - O prefixo observável da chave tem no máximo 12 hex (§3.10) e pode ser
 *   registrado sem expor o texto livre da observação.
 */

import { textoCanonico } from "../shared/json-canonico";
import { sha256Hex } from "../shared/sha256";
import type { EntradaObservacao, SinaisObservacao } from "./contratos";
import type { RegistradorRedigido } from "./observabilidade";
import { validarExtracao } from "./validacao";

/** Namespace próprio do cache semântico, versionado para permitir rotação. */
export const NAMESPACE_CACHE_SEMANTICO = "semantico:v1:";

/** TTL padrão do cache em segundos: 24 h, retenção curta por causa do texto livre (§3.1). */
export const TTL_PADRAO_CACHE_SEGUNDOS = 86400;

/** Teto, em bytes UTF-8, do valor lido do cache antes da revalidação (§3.9). */
export const LIMITE_VALOR_CACHE_BYTES = 16 * 1024;

/** Comprimento máximo do prefixo observável da chave, em caracteres hex (§3.10). */
const COMPRIMENTO_PREFIXO = 12;

/** Codificador usado para medir o teto de bytes UTF-8 do valor persistido. */
const CODIFICADOR = new TextEncoder();

/** Comprimento em bytes UTF-8 do valor bruto lido do cache. */
function bytesDoValor(valor: string): number {
  return CODIFICADOR.encode(valor).length;
}

/**
 * Contexto de inferência que participa da chave. `promptHash` é o `sha256` do
 * conteúdo do prompt, o que invalida o cache mesmo sem troca da constante de
 * versão (§3.8).
 */
export interface ContextoChaveCacheSemantica {
  modelo: string;
  promptVersao: string;
  promptHash: string;
}

/** Chave derivada mais o prefixo curto seguro para observabilidade. */
export interface ChaveCacheSemantica {
  chave: string;
  prefixo: string;
}

/**
 * Superfície mínima do binding KV. Tanto o `KVNamespace` real de
 * `CACHE_SEMANTICO` quanto o fake estrutural dos testes satisfazem esta
 * interface; `delete` é opcional porque o adaptador não o utiliza.
 */
export interface BindingCacheSemantico {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: { expirationTtl?: number }): Promise<void>;
  delete?(chave: string): Promise<void>;
}

/** Opções de configuração do adaptador de cache. */
export interface OpcoesAdaptadorCacheSemantico {
  /** TTL de retenção em segundos; padrão `TTL_PADRAO_CACHE_SEGUNDOS` (24 h). */
  ttlSegundos?: number;
  /**
   * Registrador redigido opcional das falhas isoladas do KV (§3.10). Recebe
   * apenas `estado`, `codigo` e `cache_prefixo` — nunca o erro cru, a chave
   * completa nem o texto livre da observação.
   */
  registrador?: RegistradorRedigido;
}

/** Adaptador de cache injetável consumido pela orquestração. */
export interface AdaptadorCacheSemantico {
  ler(
    entrada: EntradaObservacao,
    contexto: ContextoChaveCacheSemantica,
  ): Promise<SinaisObservacao | null>;
  gravar(
    entrada: EntradaObservacao,
    contexto: ContextoChaveCacheSemantica,
    sinais: SinaisObservacao,
  ): Promise<void>;
}

/**
 * Deriva a chave versionada do cache a partir do JSON canônico dos campos que
 * determinam a interpretação. Os nomes das chaves do objeto canônico são
 * exatamente os de §3.8, de modo que a identidade da chave é estável e
 * verificável de forma independente pelos testes.
 */
export function montarChaveCacheSemantica(
  entrada: EntradaObservacao,
  contexto: ContextoChaveCacheSemantica,
): ChaveCacheSemantica {
  const canonico = textoCanonico({
    texto: entrada.observacao_recepcao,
    convenio: entrada.convenio,
    procedimento_codigo: entrada.procedimento_codigo,
    prompt_versao: contexto.promptVersao,
    prompt_hash: contexto.promptHash,
    modelo: contexto.modelo,
  });
  const digest = sha256Hex(canonico);

  return {
    chave: `${NAMESPACE_CACHE_SEMANTICO}${digest}`,
    prefixo: digest.slice(0, COMPRIMENTO_PREFIXO),
  };
}

/**
 * Cria o adaptador de cache sobre um binding KV estrutural. O adaptador nunca
 * lança: leitura degrada para miss e gravação falha sem persistir, preservando
 * o fluxo da guia (§3.8).
 */
export function criarAdaptadorCacheSemantico(
  kv: BindingCacheSemantico,
  opcoes?: OpcoesAdaptadorCacheSemantico,
): AdaptadorCacheSemantico {
  const ttlSegundos = opcoes?.ttlSegundos ?? TTL_PADRAO_CACHE_SEGUNDOS;
  const registrador = opcoes?.registrador;

  return {
    async ler(entrada, contexto) {
      const { chave, prefixo } = montarChaveCacheSemantica(entrada, contexto);

      let valor: string | null;
      try {
        valor = await kv.get(chave);
      } catch {
        // KV indisponível na leitura: miss, sem exceção fatal. O evento
        // redigido expõe só estado, código e prefixo da chave (§3.10). A
        // própria emissão é best-effort: registrador indisponível é engolido
        // para não substituir a degradação para miss.
        try {
          registrador?.info("cache_leitura_falhou", {
            estado: "incompleta",
            codigo: "cache_indisponivel",
            cache_prefixo: prefixo,
          });
        } catch {
          // Registrador indisponível não pode fechar a guia (§3.8).
        }
        return null;
      }

      if (typeof valor !== "string") {
        return null;
      }

      // Rejeição barata antes de codificar: em UTF-8 o comprimento nunca é
      // menor que o número de code units UTF-16, então `valor.length` acima do
      // teto já é excesso certo e evita materializar/codificar o valor inteiro
      // (§3.9). Só o que passa por esse crivo é medido em bytes para preservar
      // a fronteira exata (`>`).
      if (valor.length > LIMITE_VALOR_CACHE_BYTES) {
        return null;
      }

      // Teto de bytes antes do parse: valor acima do limite é miss sobrescrevível
      // e nunca chega ao `JSON.parse` da revalidação (§3.9, §3.8).
      if (bytesDoValor(valor) > LIMITE_VALOR_CACHE_BYTES) {
        return null;
      }

      // Mesma validação da extração: JSON ilegível, schema inválido ou
      // evidência não literal são miss sobrescrevível (§3.8).
      const resultado = validarExtracao(valor, entrada.observacao_recepcao);
      return resultado.ok ? resultado.sinais : null;
    },

    async gravar(entrada, contexto, sinais) {
      const { chave, prefixo } = montarChaveCacheSemantica(entrada, contexto);
      try {
        await kv.put(chave, JSON.stringify(sinais), { expirationTtl: ttlSegundos });
      } catch {
        // KV indisponível na gravação: fluxo segue sem persistência. O evento
        // redigido expõe só estado, código e prefixo da chave (§3.10). A
        // própria emissão é best-effort: registrador indisponível é engolido
        // para não fechar a guia nem impedir a conclusão sem persistência.
        try {
          registrador?.info("cache_gravacao_falhou", {
            estado: "incompleta",
            codigo: "cache_indisponivel",
            cache_prefixo: prefixo,
          });
        } catch {
          // Registrador indisponível não pode fechar a guia (§3.8).
        }
      }
    },
  };
}
