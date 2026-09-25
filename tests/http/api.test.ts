import { describe, expect, it, vi } from "vitest";
import csv from "../../docs/fontes/guias.csv?raw";
import { parseGuiasCsv, normalizarGuia } from "../../src/domain";
import { createConference, createVitalisHandlers } from "../../src/application/runtime";
import { withOperationalLock } from "../../src/application/lock";
import { allowRateLimit } from "../../src/auth";
import { count, httpHarness, origin } from "./support";

function guia(id = "HTTP-G-1") { return { ...parseGuiasCsv(csv).guias[0].original, id_guia: id, observacao_recepcao: "" }; }
function input(id = "HTTP-G-1") { return { guia: guia(id), idempotency_key: `key-${id}` }; }
async function json(response: Response) { return await response.json() as any; }

describe("API integrada: autenticação real, SQLite, histórico e reset", () => {
  it("rotas de dados exigem sessão e mutações exigem CSRF e Origin sem gravar", async () => {
    const h = await httpHarness();
    expect((await h.request("/api/guias", { headers: { Cookie: "" } })).status).toBe(401);
    expect((await h.request("/", { headers: { Cookie: "" } })).status).toBe(302);
    expect(h.assets).not.toHaveBeenCalled();
    const invalidHeaders: Array<Record<string, string>> = [{ "X-CSRF-Token": "" }, { Origin: "https://evil.test" }, { Cookie: "" }];
    for (const headers of invalidHeaders) {
      const response = await h.post("/api/guias", input(), headers);
      expect([401, 403]).toContain(response.status);
    }
    expect(await count(h.env.DB, "guides")).toBe(0);
    expect((await h.request("/api/session")).status).toBe(200);
  });
  it("registra, retorna estado persistido e repete com idempotência sem duplicar", async () => {
    const h = await httpHarness();
    const first = await h.post("/api/guias", input()); expect(first.status).toBe(200);
    const saved = await json(first); expect(saved.persistida).toBe(true);
    const detail = await json(await h.request(`/api/guias/${saved.id}`));
    expect(saved.resultado).toEqual(detail.guia.resultado);
    const replay = await h.post("/api/guias", input()); expect(replay.status).toBe(200);
    expect((await json(replay)).tipo).toBe("reaproveitada");
    expect(await count(h.env.DB, "guides")).toBe(1); expect(await count(h.env.DB, "guide_revisions")).toBe(1);
    const conflict = await h.post("/api/guias", { ...input(), guia: { ...guia(), paciente: "OUTRO" } });
    expect(conflict.status).toBe(409); expect(await count(h.env.DB, "guide_revisions")).toBe(1);
  });
  it("duplicidade é devolvida imediatamente e correção remove o grupo preservando histórico", async () => {
    const h = await httpHarness();
    expect((await h.post("/api/guias", input("A"))).status).toBe(200);
    const duplicate = await h.post("/api/guias", input("B")); expect(duplicate.status).toBe(200);
    const body = await json(duplicate);
    expect(body.resultado.motivos.some((m: any) => m.codigo === "duplicidade_grupo_candidato")).toBe(true);
    const corrected = await h.post("/api/guias", { guia: { ...guia("B"), paciente: "PACIENTE-DIFERENTE" }, idempotency_key: "correcao-B" });
    expect(corrected.status).toBe(200);
    const listing = await json(await h.request("/api/guias"));
    expect(listing.guias).toHaveLength(2);
    expect(listing.guias.every((g: any) => !g.motivos.some((m: any) => m.codigo === "duplicidade_grupo_candidato"))).toBe(true);
    const detail = await json(await h.request("/api/guias/B")); expect(detail.revisoes).toHaveLength(2);
  });
  it("importação avança em chunks, bloqueia reset em andamento e reset preserva segurança/regras", async () => {
    const h = await httpHarness();
    const small = csv.split(/\r?\n/).slice(0, 5).join("\n");
    const started = await h.post("/api/importacoes", { csv: small, idempotency_key: "import-http" });
    expect(started.status).toBe(200); const initial = await json(started);
    expect(initial.lote.status).toBe("PROCESSANDO"); expect(initial.progresso.pendentes).toBe(4);
    expect((await h.post("/api/reset", { confirmacao: "REINICIAR" })).status).toBe(409);
    const firstChunk = await json(await h.post(`/api/importacoes/${initial.lote.id}/processar`, {}));
    expect(firstChunk.progresso.pendentes).toBe(1);
    const lastChunk = await h.post(`/api/importacoes/${initial.lote.id}/processar`, {}); expect(lastChunk.status).toBe(200);
    expect((await json(lastChunk)).lote.status).toBe("CONCLUIDO"); expect(await count(h.env.DB, "guides")).toBe(4);
    await allowRateLimit(h.env.DB, "persistent-auth", 10, 900);
    await h.env.DB.prepare("INSERT INTO oauth_state_consumptions(state_id,expires_at) VALUES('kept',9999999999)").run();
    h.oauth.set("existing-token", "must-remain");
    expect((await h.post("/api/reset", { confirmacao: "REINICIAR" })).status).toBe(200);
    expect(await count(h.env.DB, "guides")).toBe(0); expect(await count(h.env.DB, "imports")).toBe(0);
    expect(await count(h.env.DB, "rulesets")).toBe(1); expect(await count(h.env.DB, "auth_rate_limits")).toBeGreaterThan(0);
    expect(await count(h.env.DB, "oauth_state_consumptions")).toBe(1); expect(h.oauth.get("existing-token")).toBe("must-remain");
  });
  it("replay concluído mantém o lote e as revisões sem batch nem IA", async () => {
    const h = await httpHarness();
    const payload = { csv: csv.split(/\r?\n/).slice(0, 3).join("\n"), idempotency_key: "replay-d1" };
    const initial = await json(await h.post("/api/importacoes", payload));
    const completed = await json(await h.post(`/api/importacoes/${initial.lote.id}/processar`, {}));
    expect(completed.lote.status).toBe("CONCLUIDO");
    const before = await json(await h.request("/api/guias"));
    const originalBatch = h.env.DB.batch;
    const batch = vi.fn(async () => { throw new Error("Replay tentou gravar novamente"); });
    h.env.DB.batch = batch;
    h.ai.mockClear();
    const replay = await h.post("/api/importacoes", payload);
    expect(replay.status).toBe(200);
    expect(await json(replay)).toEqual(completed);
    expect(batch).not.toHaveBeenCalled(); expect(h.ai).not.toHaveBeenCalled();
    // A listagem usa batch de leitura consistente; só o replay é sob teste aqui.
    h.env.DB.batch = originalBatch;
    expect(await json(await h.request("/api/guias"))).toEqual(before);
    expect(await count(h.env.DB, "imports")).toBe(1);
    expect(await count(h.env.DB, "guide_revisions")).toBe(2);
  });
  it("mesma chave com CSV diferente retorna conflito sem alterar o lote", async () => {
    const h = await httpHarness();
    const payload = { csv: csv.split(/\r?\n/).slice(0, 3).join("\n"), idempotency_key: "csv-conflict" };
    const initial = await json(await h.post("/api/importacoes", payload));
    const before = await json(await h.request(`/api/importacoes/${initial.lote.id}`));
    const conflict = await h.post("/api/importacoes", { ...payload, csv: payload.csv + "\nlinha divergente" });
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain(payload.idempotency_key);
    expect(await json(await h.request(`/api/importacoes/${initial.lote.id}`))).toEqual(before);
    expect(await count(h.env.DB, "imports")).toBe(1);
  });
  it("reenvio de conteúdo histórico não informa a revisão antiga como vigente", async () => {
    const h = await httpHarness();
    await h.post("/api/guias", input("HISTORY"));
    const revised = await json(await h.post("/api/guias", { guia: { ...guia("HISTORY"), paciente: "NOVA REVISÃO" }, idempotency_key: "history-B" }));
    const historical = await json(await h.post("/api/guias", { guia: guia("HISTORY"), idempotency_key: "history-A-again" }));
    expect(historical.tipo).toBe("reaproveitada");
    expect(historical.revisaoReaproveitadaVigente).toBe(false);
    expect(historical.guia.original.paciente).toBe("NOVA REVISÃO");
    expect(historical.resultado).toEqual(revised.resultado);
    const detail = await json(await h.request("/api/guias/HISTORY"));
    expect(detail.revisoes.map((revision: any) => revision.vigente)).toEqual([1, 0]);
    expect(await count(h.env.DB, "guide_revisions")).toBe(2);
  });
  it("período civil brasileiro e ISO retornam o mesmo relatório, incluindo as bordas", async () => {
    const h = await httpHarness();
    await h.post("/api/guias", { guia: { ...guia("PERIOD"), data_lancamento: "01/08/2026" }, idempotency_key: "period" });
    const iso = await json(await h.request("/api/dashboard?de=2026-08-01&ate=2026-08-01"));
    const brasileiro = await json(await h.request("/api/dashboard?de=01%2F08%2F2026&ate=01%2F08%2F2026"));
    expect(iso.atividade.guias).toBe(1);
    expect(brasileiro.atividade).toEqual(iso.atividade);
    expect((await h.request("/api/dashboard?de=2026-08-02&ate=2026-08-01")).status).toBe(422);
    expect((await h.request("/api/dashboard?de=31%2F02%2F2026&ate=31%2F02%2F2026")).status).toBe(422);
  });
  it("CSV com cabeçalho inválido mantém falhas auditáveis e não cria guia nem chama IA", async () => {
    const h = await httpHarness();
    const created = await h.post("/api/importacoes", { csv: "id,paciente\nG-1,Pessoa\nG-2,Outra", idempotency_key: "invalid-csv" });
    expect(created.status).toBe(200);
    const body = await json(created);
    expect(body.lote.status).toBe("FALHOU");
    expect(body.progresso.comFalha).toBe(3);
    const detail = await json(await h.request(`/api/importacoes/${body.lote.id}`));
    expect(detail.linhas).toHaveLength(3);
    expect(detail.linhas.every((line: any) => line.estado === "FALHOU" && typeof line.motivo === "string")).toBe(true);
    expect(await count(h.env.DB, "guides")).toBe(0);
    expect(h.ai).not.toHaveBeenCalled();
    expect((await h.post("/api/reset", { confirmacao: "REINICIAR" })).status).toBe(200);
  });
  it("trava operacional impede reset/registro durante escrita concorrente e é liberada após erro", async () => {
    const h = await httpHarness(); let release!: () => void; let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const blocker = withOperationalLock(h.env.DB, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await ready;
    expect((await h.post("/api/guias", input())).status).toBe(409);
    expect((await h.post("/api/reset", { confirmacao: "REINICIAR" })).status).toBe(409);
    release(); await blocker;
    expect((await h.post("/api/guias", input())).status).toBe(200);
    await expect(withOperationalLock(h.env.DB, async () => { throw new Error("failure"); })).rejects.toThrow("failure");
    expect(await count(h.env.DB, "operational_locks")).toBe(0);
  });
  it("mesma observação com outro convênio tem identidade de extração separada", async () => {
    const h = await httpHarness(); const conference = createConference(h.env);
    const original = { ...guia(), observacao_recepcao: "Trouxe exame novo, anexado ao prontuário." };
    const first = await conference(normalizarGuia({ original, numero: 1, linhaOriginal: "" }));
    const second = await conference(normalizarGuia({ original: { ...original, convenio: "Plano Bem" }, numero: 1, linhaOriginal: "" }));
    expect(first.resultado.checagem_textual).toBe("completa"); expect(second.resultado.checagem_textual).toBe("completa");
    expect(first.extracao?.observacaoHash).not.toBe(second.extracao?.observacaoHash);
    const handlers = createVitalisHandlers({ env: h.env, actor: { userId: "demo" } });
    await handlers.registrarGuia({ guia: original, idempotency_key: "context-1" });
    await handlers.registrarGuia({ guia: { ...original, id_guia: "HTTP-G-2", convenio: "Plano Bem" }, idempotency_key: "context-2" });
    expect(await count(h.env.DB, "semantic_extractions")).toBe(2);
  });
  it("API retorna erro JSON conhecido em entrada inválida sem SQL ou stack", async () => {
    const h = await httpHarness();
    const response = await h.post("/api/guias", { guia: {}, idempotency_key: "invalid" });
    expect(response.status).toBe(422); expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).not.toMatch(/INSERT|SELECT|at.*\.ts|SQLITE/);
  });
});
