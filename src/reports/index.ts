/**
 * Barrel público dos relatórios.
 *
 * Os testes de `tests/reports` carregam este módulo por `import.meta.glob`; os
 * dois recortes (estoque atual e atividade por `data_lancamento`) e seus tipos
 * precisam ser exportados nominalmente daqui.
 */

export { relatorioEstoque } from "./estoque";
export { relatorioAtividade } from "./atividade";
export {
  CODIGOS_TEXTUAIS_DUPLICIDADE,
  montarRelatorio,
  somarCentavos,
} from "./agregacao";
export type {
  ContagemCodigo,
  OpcoesRelatorioAtividade,
  OpcoesRelatorioEstoque,
  RelatorioGuias,
} from "./contratos";
export type { FindingRecorte, LinhaRecorte, RecorteTemporal } from "./agregacao";
