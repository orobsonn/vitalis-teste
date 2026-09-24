/**
 * Relatório de atividade semanal: guias com revisão e validação vigentes cuja
 * `data_lancamento` civil cai em `[de, ate]` (inclusivo). `processado_em` é
 * auditoria técnica e nunca filtra métrica. `falhasProcessamento` conta apenas
 * linhas `FALHOU` de lotes iniciados dentro da janela. Somente leitura.
 */

import {
  carregarFindings,
  carregarLinhas,
  montarRelatorio,
} from "./agregacao";
import type { OpcoesRelatorioAtividade, RelatorioGuias } from "./contratos";

async function contarFalhasDaJanela(
  db: D1Database,
  de: string,
  ate: string,
): Promise<number> {
  const linha = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM import_lines l
         JOIN imports i ON i.id = l.import_id
        WHERE l.estado = ?
          AND substr(i.iniciado_em, 1, 10) >= ?
          AND substr(i.iniciado_em, 1, 10) <= ?`,
    )
    .bind("FALHOU", de, ate)
    .first<{ total: number }>();
  return linha === null || linha === undefined ? 0 : Number(linha.total);
}

/**
 * Lotes ainda em PROCESSANDO iniciados dentro da janela (J20): expõe o estado
 * intermediário usando a mesma regra temporal de J6 para falhas. Somente
 * leitura; valores sempre por `bind`.
 */
async function contarLotesProcessandoDaJanela(
  db: D1Database,
  de: string,
  ate: string,
): Promise<number> {
  const linha = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM imports
        WHERE status = ?
          AND substr(iniciado_em, 1, 10) >= ?
          AND substr(iniciado_em, 1, 10) <= ?`,
    )
    .bind("PROCESSANDO", de, ate)
    .first<{ total: number }>();
  return linha === null || linha === undefined ? 0 : Number(linha.total);
}

export async function relatorioAtividade(
  db: D1Database,
  opcoes: OpcoesRelatorioAtividade,
): Promise<RelatorioGuias> {
  const recorte = { de: opcoes.de, ate: opcoes.ate };
  const linhas = await carregarLinhas(db, recorte);
  const findings = await carregarFindings(db);
  const falhasProcessamento = await contarFalhasDaJanela(db, opcoes.de, opcoes.ate);
  const lotesProcessando = await contarLotesProcessandoDaJanela(db, opcoes.de, opcoes.ate);
  return montarRelatorio(
    linhas,
    findings,
    falhasProcessamento,
    lotesProcessando,
    { de: opcoes.de, ate: opcoes.ate },
    opcoes.referencia ?? null,
  );
}
