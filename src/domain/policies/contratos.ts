/**
 * Contratos compartilhados dos sinais textuais de observação.
 *
 * Este módulo expõe apenas o vocabulário fechado e os tipos das estruturas que
 * atravessam a validação semântica (`src/semantic/**`) e as políticas
 * determinísticas do domínio. Nenhum comportamento vive aqui: os literais são a
 * única fonte de verdade do vocabulário e não devem ser renomeados.
 */

/** Vocabulário fechado dos sinais extraídos da observação. */
export const TIPOS_SINAL = [
  "autorizacao_nova_nao_cadastrada",
  "autorizacao_verbal_sem_numero",
  "reagendamento_mencionado",
  "decisao_por_particular",
  "pergunta_sobre_preco_particular",
  "pedido_de_recibo",
  "procedimento_realizado_divergente",
  "nota_administrativa",
] as const;

/** Vocabulário fechado das ambiguidades materiais da observação. */
export const TIPOS_AMBIGUIDADE = [
  "autorizacao_indefinida",
  "modalidade_indefinida",
  "procedimento_indefinido",
  "outro_material",
] as const;

/** Nome canônico de um sinal extraído. */
export type TipoSinal = (typeof TIPOS_SINAL)[number];

/** Nome canônico de uma ambiguidade material. */
export type TipoAmbiguidade = (typeof TIPOS_AMBIGUIDADE)[number];

/** Sinal extraído: tipo fechado e a citação literal que o sustenta. */
export interface Sinal {
  tipo: TipoSinal;
  evidencia: string;
}

/** Ambiguidade material: tipo fechado e a citação literal que a sustenta. */
export interface Ambiguidade {
  tipo: TipoAmbiguidade;
  evidencia: string;
}

/** Situação textual consolidada, sempre coerente com `sinais` (§3.3). */
export interface SituacaoTextual {
  autorizacao: "nenhuma" | "nova_nao_cadastrada" | "verbal_sem_numero";
  modalidade: "nenhuma" | "particular_decidido" | "somente_pergunta";
  procedimento: "nenhuma" | "realizado_divergente";
  reagendamento: "nenhum" | "mencionado";
}

/** Extração textual validada: sinais, situação e ambiguidades. */
export interface SinaisObservacao {
  sinais: Sinal[];
  situacao: SituacaoTextual;
  ambiguidades: Ambiguidade[];
}
