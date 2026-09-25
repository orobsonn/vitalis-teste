/**
 * Relatório de atividade semanal: guias com revisão e validação vigentes cuja
 * `data_lancamento` civil cai em `[de, ate]` (inclusivo). `processado_em` é
 * auditoria técnica e nunca filtra métrica. `falhasProcessamento` conta apenas
 * linhas `FALHOU` de lotes iniciados dentro da janela; `lotesProcessando` conta
 * todo lote `PROCESSANDO`, sem corte temporal (J20), pois ainda pode escrever no
 * recorte. Somente leitura.
 */

import {
  carregarSnapshotRelatorio,
  montarRelatorio,
} from "./agregacao";
import type { OpcoesRelatorioAtividade, RelatorioGuias } from "./contratos";

export async function relatorioAtividade(
  db: D1Database,
  opcoes: OpcoesRelatorioAtividade,
): Promise<RelatorioGuias> {
  const recorte = { de: opcoes.de, ate: opcoes.ate };
  const { linhas, findings, falhasProcessamento, lotesProcessando } = await carregarSnapshotRelatorio(db, recorte);
  return montarRelatorio(
    linhas,
    findings,
    falhasProcessamento,
    lotesProcessando,
    { de: opcoes.de, ate: opcoes.ate },
    opcoes.referencia ?? null,
  );
}
