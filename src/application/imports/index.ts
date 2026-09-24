/**
 * Barrel público da orquestração de importação retomável.
 *
 * Expõe as seis APIs aprovadas (inicialização idempotente, chunk atômico,
 * continuação, lote completo, leitura de progresso e finalização derivada) e os
 * contratos consumidos pela camada de composição.
 */

export {
  continuarImportacao,
  finalizarLoteSeTerminal,
  importarLote,
  iniciarImportacao,
  lerProgresso,
  processarProximoChunk,
} from "./orquestracao";

export type {
  LoteImportacao,
  OpcoesContinuarImportacao,
  OpcoesFinalizarLote,
  OpcoesIniciarImportacao,
  OpcoesProcessarChunk,
  ProgressoImportacao,
  ResultadoImportacaoLote,
} from "./contratos";
