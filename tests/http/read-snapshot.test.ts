import { describe, expect, it } from "vitest";
import csv from "../../docs/fontes/guias.csv?raw";
import { parseGuiasCsv } from "../../src/domain";
import { guideDetail } from "../../src/application/views";
import { relatorioAtividade, relatorioEstoque } from "../../src/reports";
import { httpHarness } from "./support";

async function pendingGuide() {
  const h = await httpHarness();
  const corrected = { ...parseGuiasCsv(csv).guias[0].original, id_guia: "READ-RACE", observacao_recepcao: "" };
  const response = await h.post("/api/guias", {
    guia: { ...corrected, numero_autorizacao: "" }, idempotency_key: "read-before",
  });
  expect(response.status).toBe(200);
  const saved = await response.json() as { id: string };
  return { h, corrected, saved };
}

/** Let an actual correction commit after the first complete database read. */
function correctBetweenReads(db: D1Database, correct: () => Promise<void>) {
  let corrected = false;
  async function afterRead() {
    if (corrected) return;
    corrected = true;
    await correct();
  }
  const prepare = db.prepare.bind(db);
  db.prepare = ((sql: string) => {
    const statement = prepare(sql);
    const all = statement.all.bind(statement);
    statement.all = (async () => { const rows = await all(); await afterRead(); return rows; }) as typeof statement.all;
    return statement;
  }) as typeof db.prepare;
  const batch = db.batch.bind(db);
  db.batch = (async (statements: D1PreparedStatement[]) => {
    const rows = await batch(statements); await afterRead(); return rows;
  }) as typeof db.batch;
}

describe("leituras consistentes durante correção", () => {
  it("detalhe mantém cabeçalho, revisão vigente e histórico do mesmo instante", async () => {
    const { h, corrected, saved } = await pendingGuide();
    correctBetweenReads(h.env.DB, async () => {
      expect((await h.post("/api/guias", { guia: corrected, idempotency_key: "read-after" })).status).toBe(200);
    });
    const detail = (await guideDetail(h.env.DB, saved.id))!;
    const current = detail.revisoes.find(revision => revision.vigente === 1)!;
    expect(detail.guia.revisaoNumero).toBe(current.numero);
    expect(detail.guia.original).toEqual(current.entradaOriginal);
    expect(detail.guia.decisao).toBe(current.validacoes.find(validation => validation.vigente === 1)!.decisao);
    const next = (await guideDetail(h.env.DB, saved.id))!;
    expect(next.guia.revisaoNumero).toBe(2);
    expect(next.guia.decisao).toBe("OK");
  });

  it.each(["estoque", "atividade"] as const)("%s preserva motivos e exposição da validação contada", async kind => {
    const { h, corrected } = await pendingGuide();
    correctBetweenReads(h.env.DB, async () => {
      expect((await h.post("/api/guias", { guia: corrected, idempotency_key: "read-after" })).status).toBe(200);
    });
    const report = kind === "estoque" ? await relatorioEstoque(h.env.DB)
      : await relatorioAtividade(h.env.DB, { de: "2026-08-01", ate: "2026-08-31" });
    expect(report.pendentes).toBe(1);
    expect(report.porCodigo.campo_obrigatorio_ausente?.guias).toBe(1);
    expect(report.exposicaoEstruturadaCentavos).toBe(6200);
    expect(report.exposicaoTextualDuplicidadeCentavos).toBe(0);
    const next = await relatorioEstoque(h.env.DB);
    expect(next.ok).toBe(1); expect(next.exposicaoCentavos).toBe(0);
  });
});
