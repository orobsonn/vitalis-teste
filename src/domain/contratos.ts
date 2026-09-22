/**
 * Contratos tipados da biblioteca de domínio.
 *
 * Este módulo expõe apenas os contratos (tipos) das 18 colunas cruas da guia
 * importada. Nenhum comportamento do núcleo determinístico vive aqui.
 */

/** As 18 colunas cruas da guia, na ordem do cabeçalho importado. */
export const COLUNAS_GUIA = [
  "id_guia",
  "unidade",
  "data_atendimento",
  "paciente",
  "convenio",
  "carteirinha",
  "cid",
  "procedimento_codigo",
  "procedimento_descricao",
  "numero_autorizacao",
  "autorizacao_validade",
  "autorizacao_sessoes_limite",
  "sessao_numero_na_autorizacao",
  "profissional",
  "profissional_registro",
  "valor",
  "observacao_recepcao",
  "data_lancamento",
] as const;

/** Nome canônico de uma coluna crua da guia. */
export type ColunaGuia = (typeof COLUNAS_GUIA)[number];

/** Linha crua da guia, com um valor textual por coluna aprovada. */
export interface GuiaOriginal {
  id_guia: string;
  unidade: string;
  data_atendimento: string;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimento_codigo: string;
  procedimento_descricao: string;
  numero_autorizacao: string;
  autorizacao_validade: string;
  autorizacao_sessoes_limite: string;
  sessao_numero_na_autorizacao: string;
  profissional: string;
  profissional_registro: string;
  valor: string;
  observacao_recepcao: string;
  data_lancamento: string;
}
