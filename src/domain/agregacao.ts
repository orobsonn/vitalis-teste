/**
 * Agregação determinística do recorte estruturado do lote.
 *
 * Cada guia pendente entra uma única vez em `valorAssociadoCentavos`, mesmo com
 * vários motivos; alertas não entram. A limitação global aparece uma única vez.
 */

import { LIMITACAO_GLOBAL_DURACAO_MAXIMA } from "./catalogo";
import type { GuiaNormalizada } from "./normalizacao";
import type { ResultadoVerificacao } from "./motor";

export interface AgregacaoCorpus {
  ocorrencias: number;
  guiasComPendencia: number;
  valorAssociadoCentavos: number;
  porCodigo: Record<string, number>;
  camposObrigatoriosAusentes: Record<string, number>;
  totalIncompleto: boolean;
  limitacoesGlobais: string[];
}

export function agregarVerificacoes(
  entradas: ReadonlyArray<{ guia: GuiaNormalizada; resultado: ResultadoVerificacao }>,
): AgregacaoCorpus {
  let ocorrencias = 0;
  let guiasComPendencia = 0;
  let valorAssociadoCentavos = 0;
  let totalIncompleto = false;
  const porCodigo: Record<string, number> = {};
  const camposObrigatoriosAusentes: Record<string, number> = {};

  for (const entrada of entradas) {
    const { guia, resultado } = entrada;
    ocorrencias += resultado.motivos.length;

    if (resultado.decisao === "PENDENTE") {
      guiasComPendencia += 1;
      if (guia.valorCentavos !== null) {
        valorAssociadoCentavos += guia.valorCentavos;
      }
    }

    if (guia.valorCentavos === null) {
      totalIncompleto = true;
    }

    for (const motivo of resultado.motivos) {
      porCodigo[motivo.codigo] = (porCodigo[motivo.codigo] ?? 0) + 1;
      if (motivo.codigo === "campo_obrigatorio_ausente") {
        for (const campo of motivo.campos) {
          camposObrigatoriosAusentes[campo] = (camposObrigatoriosAusentes[campo] ?? 0) + 1;
        }
      }
    }
  }

  return {
    ocorrencias,
    guiasComPendencia,
    valorAssociadoCentavos,
    porCodigo,
    camposObrigatoriosAusentes,
    totalIncompleto,
    limitacoesGlobais: [LIMITACAO_GLOBAL_DURACAO_MAXIMA],
  };
}
