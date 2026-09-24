/**
 * Relatório de atividade semanal: guias com revisão e validação vigentes cuja
 * `data_lancamento` civil cai em `[de, ate]` (inclusivo). `processado_em` é
 * auditoria técnica e nunca filtra métrica. `falhasProcessamento` conta apenas
 * linhas `FALHOU` de lotes iniciados dentro da janela; `lotesProcessando` conta
 * todo lote `PROCESSANDO`, sem corte temporal (J20), pois ainda pode escrever no
 * recorte. Somente leitura.
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
 * Lotes ainda em PROCESSANDO (J20): qualquer lote em andamento é observável,
 * independente de `iniciado_em`, pois ele ainda pode escrever guias cuja
 * `data_lancamento` cai no recorte. Assim o consumidor não trata estado
 * intermediário como métrica final. Somente leitura; valores por `bind`.
 */
async function contarLotesProcessando(db: D1Database): Promise<number> {
  const linha = await db
    .prepare("SELECT COUNT(*) AS total FROM imports WHERE status = ?")
    .bind("PROCESSANDO")
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
  const lotesProcessando = await contarLotesProcessando(db);
  return montarRelatorio(
    linhas,
    findings,
    falhasProcessamento,
    lotesProcessando,
    { de: opcoes.de, ate: opcoes.ate },
    opcoes.referencia ?? null,
  );
}
