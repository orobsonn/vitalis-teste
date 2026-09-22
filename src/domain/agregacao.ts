/**
 * Agregação determinística do recorte estruturado do lote.
 *
 * Cada guia pendente entra uma única vez em `valorAssociadoCentavos`, mesmo com
 * vários motivos; alertas não entram. A limitação global aparece uma única vez.
 *
 * A soma monetária é verificada: duas parcelas individualmente seguras podem
 * ultrapassar `Number.MAX_SAFE_INTEGER` e um total arredondado não pode ser
 * publicado. Ao detectar o estouro, o total satura em `Number.MAX_SAFE_INTEGER`
 * e a limitação `LIMITACAO_SOMA_NAO_VERIFICAVEL` é acrescentada à via existente
 * de `limitacoesGlobais`. Saturar (em vez de descartar a parcela) mantém o
 * resultado independente da ordem de entrada.
 */

import { LIMITACAO_GLOBAL_DURACAO_MAXIMA } from "./catalogo";
import type { GuiaNormalizada } from "./normalizacao";
import type { ResultadoVerificacao } from "./motor";

export const LIMITACAO_SOMA_NAO_VERIFICAVEL = "soma_de_valores_nao_verificavel";

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
  limitacoesGlobaisDoCatalogo?: readonly string[],
): AgregacaoCorpus {
  let ocorrencias = 0;
  let guiasComPendencia = 0;
  let valorAssociadoCentavos = 0;
  let totalIncompleto = false;
  let somaNaoVerificavel = false;
  const porCodigo: Record<string, number> = {};
  const camposObrigatoriosAusentes: Record<string, number> = {};

  for (const entrada of entradas) {
    const { guia, resultado } = entrada;
    ocorrencias += resultado.motivos.length;

    if (resultado.decisao === "PENDENTE") {
      guiasComPendencia += 1;
      if (guia.valorCentavos !== null) {
        const proximoTotal = valorAssociadoCentavos + guia.valorCentavos;
        if (Number.isSafeInteger(proximoTotal)) {
          valorAssociadoCentavos = proximoTotal;
        } else {
          valorAssociadoCentavos = Number.MAX_SAFE_INTEGER;
          somaNaoVerificavel = true;
        }
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

  // §4.5/#ac-18 e §4.9: as limitações globais validadas do catálogo chegam ao
  // agregado na ordem declarada, sem duplicatas, e a obrigatória entra apenas se
  // ausente. `soma_de_valores_nao_verificavel` só é declarada no estouro real.
  const limitacoesGlobais: string[] = [];
  const acrescentarLimitacao = (limitacao: string): void => {
    if (!limitacoesGlobais.includes(limitacao)) {
      limitacoesGlobais.push(limitacao);
    }
  };
  for (const limitacao of limitacoesGlobaisDoCatalogo ?? []) {
    acrescentarLimitacao(limitacao);
  }
  acrescentarLimitacao(LIMITACAO_GLOBAL_DURACAO_MAXIMA);
  if (somaNaoVerificavel) {
    acrescentarLimitacao(LIMITACAO_SOMA_NAO_VERIFICAVEL);
  }

  return {
    ocorrencias,
    guiasComPendencia,
    valorAssociadoCentavos,
    porCodigo,
    camposObrigatoriosAusentes,
    totalIncompleto,
    limitacoesGlobais,
  };
}
