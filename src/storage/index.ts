/**
 * Barrel público da camada de armazenamento.
 *
 * Os testes de `tests/storage` carregam este módulo por `import.meta.glob`;
 * todas as funções aprovadas precisam ser exportadas nominalmente daqui.
 */

export { executarBatchAtomico } from "./batch";
export { traduzirConflitoUnicidade } from "./conflitos";
export { contarLinhasPorEstado, lerImportacao, lerLinhasDoLote } from "./consultas";
export {
  exigirCentavosNormalizados,
  exigirVigente,
  inserirGuia,
  inserirRevisaoVigente,
  inserirValidacaoVigente,
  lerEstadoGlobal,
  lerGuia,
  lerHistoricoRevisoes,
  lerRevisaoVigente,
  lerValidacaoVigente,
  reservarVersaoGlobal,
} from "./repositorios";
export {
  jsonDaLinha,
  jsonParaBind,
  mapearGuia,
  mapearImportacao,
  mapearLinhaImportacao,
  mapearRevisao,
  mapearValidacao,
} from "./mapeadores";

export type {
  ContagemLinhasImportacao,
  EntradaReservaVersaoGlobal,
  EstadoLinhaImportacao,
  GuiaPersistida,
  ImportacaoPersistida,
  LinhaImportacao,
  ResultadoReservaVersaoGlobal,
  ResultadoTraducaoUnicidade,
  RevisaoPersistida,
  StatusImportacao,
  TimestampIso,
  ValidacaoPersistida,
  Vigente,
} from "./contratos";
export type { LinhaBanco } from "./mapeadores";
