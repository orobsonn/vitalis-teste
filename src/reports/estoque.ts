/**
 * Relatório de estoque atual: todas as guias com revisão e validação vigentes,
 * sem recorte temporal. `falhasProcessamento` conta todas as linhas `FALHOU`
 * (inclusive as que não geraram nenhuma revisão). Somente leitura.
 */

import {
  carregarSnapshotRelatorio,
  montarRelatorio,
} from "./agregacao";
import type { OpcoesRelatorioEstoque, RelatorioGuias } from "./contratos";

export async function relatorioEstoque(
  db: D1Database,
  opcoes?: OpcoesRelatorioEstoque,
): Promise<RelatorioGuias> {
  const { linhas, findings, falhasProcessamento, lotesProcessando } =
    await carregarSnapshotRelatorio(db, { de: null, ate: null });
  return montarRelatorio(
    linhas,
    findings,
    falhasProcessamento,
    lotesProcessando,
    { de: null, ate: null },
    opcoes?.referencia ?? null,
  );
}
