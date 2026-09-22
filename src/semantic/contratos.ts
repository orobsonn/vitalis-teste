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
