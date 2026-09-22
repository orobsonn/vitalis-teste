export { COLUNAS_GUIA } from "./contratos";
export type { ColunaGuia, GuiaOriginal } from "./contratos";

export { parseGuiasCsv } from "./csv";
export type { FalhaCsv, LinhaGuiaCsv, ResultadoCsv } from "./csv";

export { compararData, dataParaIso, parseDataCivil, somarDias } from "./datas";
export type { DataCivil } from "./datas";

export { formatarCentavos, valorParaCentavos } from "./dinheiro";

export {
  buscarConvenio,
  buscarProcedimento,
  carregarCatalogo,
  consultarRegra,
  hashCatalogo,
  LIMITACAO_GLOBAL_DURACAO_MAXIMA,
  LIMITACAO_SOMA_NAO_VERIFICAVEL,
  normalizarChave,
} from "./catalogo";
export type {
  Catalogo,
  ConsultaRegra,
  ConvenioCatalogo,
  ProcedimentoCatalogo,
  ResultadoCatalogo,
} from "./catalogo";

export { inteiroDaGuia, normalizarGuia } from "./normalizacao";
export type { CodigoProblema, GuiaNormalizada, ProblemaNormalizacao } from "./normalizacao";

export { verificarGuia } from "./motor";
export type { Motivo, ResultadoVerificacao, SeveridadeMotivo } from "./motor";

export { agregarVerificacoes } from "./agregacao";
export type { AgregacaoCorpus } from "./agregacao";
