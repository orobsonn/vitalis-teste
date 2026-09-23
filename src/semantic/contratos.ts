/**
 * Contratos da interpretação semântica de observações.
 *
 * Reexporta o vocabulário e as estruturas compartilhados em
 * `src/domain/policies/contratos.ts` e declara as interfaces injetáveis do
 * caminho de extração (§3.1/§3.7). Só há tipos aqui; nenhum comportamento.
 */

export {
  TIPOS_AMBIGUIDADE,
  TIPOS_SINAL,
} from "../domain/policies/contratos";

export type {
  Ambiguidade,
  Sinal,
  SinaisObservacao,
  SituacaoTextual,
  TipoAmbiguidade,
  TipoSinal,
} from "../domain/policies/contratos";

import type { SituacaoTextual } from "../domain/policies/contratos";
import { codificarUtf8 } from "../shared/sha256";

/**
 * Fonte canônica única dos literais de `situacao` (§3.3), por campo.
 *
 * O `satisfies` liga em tempo de compilação cada lista ao tipo declarado
 * `SituacaoTextual`: renomear um literal ou incluir um valor fora do tipo vira
 * erro de tipo. O schema Zod de `situacao` consome esta fonte.
 *
 * O congelamento é profundo (`Object.freeze` em cada lista e no objeto):
 * `as const`/`readonly` só restringem o TypeScript, então sem o freeze em runtime
 * um consumidor do barrel poderia mutar a fonte e fazê-la divergir do schema já
 * construído na inicialização do módulo e do prompt.
 */
export const VALORES_SITUACAO = Object.freeze({
  autorizacao: Object.freeze(["nenhuma", "nova_nao_cadastrada", "verbal_sem_numero"] as const),
  modalidade: Object.freeze(["nenhuma", "particular_decidido", "somente_pergunta"] as const),
  procedimento: Object.freeze(["nenhuma", "realizado_divergente"] as const),
  reagendamento: Object.freeze(["nenhum", "mencionado"] as const),
}) satisfies { readonly [K in keyof SituacaoTextual]: readonly SituacaoTextual[K][] };

/** União única dos literais de `situacao`, derivada da fonte acima. */
export const LITERAIS_SITUACAO: readonly string[] = Object.freeze([
  ...new Set(Object.values(VALORES_SITUACAO).flat()),
]);

/**
 * Teto de abuso, em bytes UTF-8, por campo bruto enviado ao provedor
 * (`observacao_recepcao`, `convenio`, `procedimento_codigo`).
 *
 * É somente um teto de proteção contra entrada abusiva: não substitui nem
 * altera os limites semânticos do schema (comprimentos máximos em caracteres
 * após trim e a cardinalidade 8/3/500), que permanecem onde estão.
 */
export const LIMITE_TEXTO_BRUTO_BYTES = 64 * 1024;

/**
 * Indica se um campo bruto de entrada excede o teto de abuso, medindo bytes
 * UTF-8. Pura e barata: decide pela pré-checagem em code units UTF-16
 * (`valor.length`) sempre que ela já for conclusiva, sem codificar a string.
 *
 * Racional da pré-checagem: em UTF-8, todo code point gera ao menos tantos
 * bytes quanto code units UTF-16 ocupa (ASCII 1/1; BMP 2–3 bytes por 1 code
 * unit; astral 4 bytes por 2 code units; surrogate isolado é substituído por
 * U+FFFD, 3 bytes por 1 code unit), isto é, `bytes >= valor.length` sempre.
 * Logo `valor.length > LIMITE_TEXTO_BRUTO_BYTES` já implica
 * `bytes > LIMITE_TEXTO_BRUTO_BYTES` e retorna `true` sem codificar. Só quando
 * `.length` não decide é que a medição exata em bytes UTF-8 é feita.
 *
 * A fronteira é inclusiva: exatamente o teto não é abuso (`false`); um byte
 * acima é abuso (`true`).
 */
export function campoTemTamanhoDeAbuso(valor: string): boolean {
  if (valor.length > LIMITE_TEXTO_BRUTO_BYTES) {
    return true;
  }
  return codificarUtf8(valor).length > LIMITE_TEXTO_BRUTO_BYTES;
}

/** Entrada mínima enviada ao provedor: texto livre e contexto estruturado. */
export interface EntradaObservacao {
  observacao_recepcao: string;
  convenio: string;
  procedimento_codigo: string;
}

/** Resposta bruta do provedor, antes de qualquer validação. */
export interface RespostaBruta {
  texto: string;
  modelo: string;
  promptVersao: string;
}

/** Adaptador injetável que produz a resposta bruta a ser validada. */
export interface InterpretadorObservacao {
  extrair(entrada: EntradaObservacao): Promise<RespostaBruta>;
}
