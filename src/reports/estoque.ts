/**
 * Relatório de estoque atual: todas as guias com revisão e validação vigentes,
 * sem recorte temporal. `falhasProcessamento` conta todas as linhas `FALHOU`
 * (inclusive as que não geraram nenhuma revisão). Somente leitura.
 */

import {
  carregarFindings,
  carregarLinhas,
  montarRelatorio,
} from "./agregacao";
import type { OpcoesRelatorioEstoque, RelatorioGuias } from "./contratos";

async function contarFalhasDeProcessamento(db: D1Database): Promise<number> {
  const linha = await db
    .prepare("SELECT COUNT(*) AS total FROM import_lines WHERE estado = ?")
    .bind("FALHOU")
    .first<{ total: number }>();
  return linha === null || linha === undefined ? 0 : Number(linha.total);
}

export async function relatorioEstoque(
  db: D1Database,
  opcoes?: OpcoesRelatorioEstoque,
): Promise<RelatorioGuias> {
  const linhas = await carregarLinhas(db, { de: null, ate: null });
  const findings = await carregarFindings(db);
  const falhasProcessamento = await contarFalhasDeProcessamento(db);
  return montarRelatorio(
    linhas,
    findings,
    falhasProcessamento,
    { de: null, ate: null },
    opcoes?.referencia ?? null,
  );
}
