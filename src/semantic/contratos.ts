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
