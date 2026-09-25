import { describe, expect, it } from "vitest";
import csv from "../../docs/fontes/guias.csv?raw";
import { normalizarGuia, parseGuiasCsv } from "../../src/domain";
import { createConference } from "../../src/application/runtime";
import { count, httpHarness } from "./support";

const extraction = { response: JSON.stringify({ sinais: [], situacao: { autorizacao: "nenhuma", modalidade: "nenhuma", procedimento: "nenhuma", reagendamento: "nenhum" }, ambiguidades: [] }) };
async function json(response: Response) { return await response.json() as any; }
async function pending() {
  const h = await httpHarness();
  h.ai.mockRejectedValue(new Error("provider unavailable"));
  const guia = { ...parseGuiasCsv(csv).guias[0].original, id_guia: "RETRY-1", observacao_recepcao: "Recepção conferiu o documento.", numero_autorizacao: "" };
  const saved = await json(await h.post("/api/guias", { guia, referencia_temporal: "2026-08-31", idempotency_key: "retry-original" }));
  expect(saved.resultado.checagem_textual).toBe("incompleta");
  h.ai.mockResolvedValue(extraction);
  return { h, saved };
}

describe("reconferência vigente", () => {
  it("recupera sem criar revisão, preserva referência/histórico e replay não chama IA", async () => {
    const { h, saved } = await pending();
    const before = await json(await h.request(`/api/guias/${saved.id}`));
    const response = await h.post(`/api/guias/${saved.id}/reconferir`, {});
    expect(response.status).toBe(200);
    const result = await json(response);
    expect(result.recuperada).toBe(true);
    expect(result.guia.resultado.checagem_textual).toBe("completa");
    expect(result.guia.resultado.referencia_temporal).toBe("2026-08-31");
    const after = await json(await h.request(`/api/guias/${saved.id}`));
    expect(after.revisoes).toHaveLength(1);
    expect(after.revisoes[0].validacoes).toHaveLength(2);
    expect(after.revisoes[0].validacoes[1]).toEqual({ ...before.revisoes[0].validacoes[0], vigente: 0 });
    const calls = h.ai.mock.calls.length;
    const replay = await json(await h.post(`/api/guias/${saved.id}/reconferir`, {}));
    expect(replay).toMatchObject({ recuperada: false, jaConcluida: true });
    expect(h.ai).toHaveBeenCalledTimes(calls);
    expect(await count(h.env.DB, "validations")).toBe(2);
  });
  it("nova falha mantém validação anterior e repetição imediata retorna429", async () => {
    const { h, saved } = await pending(); h.ai.mockRejectedValue(new Error("still unavailable"));
    const before = await json(await h.request(`/api/guias/${saved.id}`));
    const response = await h.post(`/api/guias/${saved.id}/reconferir`, {});
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ recuperada: false, jaConcluida: false });
    expect(await json(await h.request(`/api/guias/${saved.id}`))).toEqual(before);
    const calls = h.ai.mock.calls.length;
    expect((await h.post(`/api/guias/${saved.id}/reconferir`, {})).status).toBe(429);
    expect(h.ai).toHaveBeenCalledTimes(calls);
  });
  it("exigeCSRF, rejeita conteúdo enviado e guia inexistente", async () => {
    const { h, saved } = await pending();
    expect((await h.post(`/api/guias/${saved.id}/reconferir`, {}, { "X-CSRF-Token": "" })).status).toBe(403);
    expect((await h.post(`/api/guias/${saved.id}/reconferir`, { guia: { paciente: "alterado" } })).status).toBe(422);
    expect((await h.post("/api/guias/ausente/reconferir", {})).status).toBe(404);
    expect(await count(h.env.DB, "validations")).toBe(1);
  });
  it("falha durante findings reverte extração e troca da validação", async () => {
    const { h, saved } = await pending();
    const before = await json(await h.request(`/api/guias/${saved.id}`));
    await h.env.DB.exec("CREATE TRIGGER reject_retry_finding BEFORE INSERT ON findings BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    expect((await h.post(`/api/guias/${saved.id}/reconferir`, {})).status).toBe(503);
    expect(await json(await h.request(`/api/guias/${saved.id}`))).toEqual(before);
    expect(await count(h.env.DB, "semantic_extractions")).toBe(0);
  });
  it("mudança de revisão durante IA faz CAS falhar sem publicar validação/extração", async () => {
    const { h, saved } = await pending();
    h.ai.mockImplementation(async () => {
      await h.env.DB.prepare("UPDATE guide_revisions SET vigente=0 WHERE guide_id=?").bind(saved.id).run();
      return extraction;
    });
    expect((await h.post(`/api/guias/${saved.id}/reconferir`, {})).status).toBe(409);
    expect(await count(h.env.DB, "validations")).toBe(1);
    expect(await count(h.env.DB, "semantic_extractions")).toBe(0);
    expect((await h.env.DB.prepare("SELECT vigente FROM validations").first<{ vigente: number }>())?.vigente).toBe(1);
  });
  it("a validação completa de prompt antigo é atualizada sem alterar o conteúdo", async () => {
    const h = await httpHarness();
    const guia = { ...parseGuiasCsv(csv).guias[0].original, id_guia: "OLD-PROMPT", observacao_recepcao: "Recepção conferiu o documento." };
    const saved = await json(await h.post("/api/guias", { guia, idempotency_key: "old-prompt" }));
    expect(saved.resultado.checagem_textual).toBe("completa");
    await h.env.DB.prepare("UPDATE validations SET inferencia_prompt_versao='observacao-antiga' WHERE vigente=1").run();
    await h.env.DB.exec("PRAGMA defer_foreign_keys=ON");
    await h.env.DB.batch([
      h.env.DB.prepare("UPDATE semantic_extractions SET id='old-extraction',prompt_versao='observacao-antiga'"),
      h.env.DB.prepare("UPDATE validations SET extracao_id='old-extraction' WHERE extracao_id IS NOT NULL"),
    ]);
    h.semanticCache.clear();
    const calls = h.ai.mock.calls.length;
    const response = await json(await h.post(`/api/guias/${saved.id}/reconferir`, {}));
    expect(response.recuperada).toBe(true);
    expect(response.guia.original).toEqual(guia);
    expect(response.guia.resultado.inferencia_textual.prompt_versao).not.toBe("observacao-antiga");
    expect(h.ai).toHaveBeenCalledTimes(calls + 1);
    expect(await count(h.env.DB, "guide_revisions")).toBe(1);
    expect(await count(h.env.DB, "validations")).toBe(2);
  });
  it("recuperação textual mantém duplicidade na decisão e nos findings do mesmo batch", async () => {
    const { h, saved } = await pending();
    const original = saved.guia.original;
    await h.post("/api/guias", { guia: { ...original, id_guia: "RETRY-TWIN", observacao_recepcao: "" }, idempotency_key: "retry-twin" });
    const response = await json(await h.post(`/api/guias/${saved.id}/reconferir`, {}));
    expect(response.recuperada).toBe(true);
    expect(response.guia.decisao).toBe("PENDENTE");
    expect(response.guia.motivos.filter((motivo: any) => motivo.codigo === "duplicidade_grupo_candidato")).toHaveLength(1);
    expect(response.guia.resultado.checagem_textual).toBe("completa");
    const listing = await json(await h.request("/api/guias"));
    expect(listing.guias.every((guia: any) => guia.motivos.some((motivo: any) => motivo.codigo === "duplicidade_grupo_candidato"))).toBe(true);
  });
  it("extração compartilhada divergente não é vinculada a novos motivos nem altera histórico", async () => {
    const h = await httpHarness();
    const original = { ...parseGuiasCsv(csv).guias[0].original, observacao_recepcao: "Cliente decidiu atendimento particular." };
    h.ai.mockRejectedValue(new Error("provider unavailable"));
    const saved = await json(await h.post("/api/guias", { guia: { ...original, id_guia: "EXTRACTION-A" }, idempotency_key: "shared-a" }));
    expect(saved.resultado.checagem_textual).toBe("incompleta");
    const before = await json(await h.request(`/api/guias/${saved.id}`));
    const validations = await count(h.env.DB, "validations");
    h.ai.mockResolvedValue(extraction);
    const captured = (await createConference(h.env)(normalizarGuia({ original, numero: 1, linhaOriginal: "" }))).extracao!;
    h.semanticCache.clear();
    h.ai.mockImplementation(async () => {
      // Simulate another writer winning after this request's D1 pre-read.
      await h.env.DB.prepare("INSERT INTO semantic_extractions(id,observacao_hash,modelo,prompt_versao,sinais_json,situacao_json,ambiguidades_json,criado_em) VALUES(?,?,?,?,?,?,?,?)")
        .bind("raced-extraction", captured.observacaoHash, captured.modelo, captured.promptVersao,
          JSON.stringify(captured.sinais), JSON.stringify(captured.situacao), JSON.stringify(captured.ambiguidades), new Date().toISOString()).run();
      return { response: JSON.stringify({
        sinais: [{ tipo: "decisao_por_particular", evidencia: original.observacao_recepcao }],
        situacao: { autorizacao: "nenhuma", modalidade: "particular_decidido", procedimento: "nenhuma", reagendamento: "nenhum" }, ambiguidades: [],
      }) };
    });
    const retried = await h.post(`/api/guias/${saved.id}/reconferir`, {});
    expect(retried.status).toBe(503);
    expect(await json(await h.request(`/api/guias/${saved.id}`))).toEqual(before);
    expect(await count(h.env.DB, "validations")).toBe(validations);
    expect(await count(h.env.DB, "semantic_extractions")).toBe(1);
  });
});
