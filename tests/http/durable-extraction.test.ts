import { afterEach, describe, expect, it, vi } from "vitest";
import csv from "../../docs/fontes/guias.csv?raw";
import { normalizarGuia, parseGuiasCsv } from "../../src/domain";
import { catalogo, createConference } from "../../src/application/runtime";
import { prepararPersistenciaConferencia } from "../../src/application/guides";
import { count, httpHarness } from "./support";

const original = { ...parseGuiasCsv(csv).guias[0].original, id_guia: "DURABLE", observacao_recepcao: "Cliente decidiu atendimento particular." };
const normalized = (changes: Partial<typeof original> = {}) => normalizarGuia({ original: { ...original, ...changes }, numero: 1, linhaOriginal: "" });
const particular = { sinais: [{ tipo: "decisao_por_particular", evidencia: original.observacao_recepcao }], situacao: { autorizacao: "nenhuma", modalidade: "particular_decidido", procedimento: "nenhuma", reagendamento: "nenhum" }, ambiguidades: [] };
async function seed() {
  const h = await httpHarness();
  expect((await h.post("/api/guias", { guia: original, idempotency_key: "durable" })).status).toBe(200);
  return h;
}
afterEach(() => vi.useRealTimers());

describe("extração persistida como fonte da mesma interpretação", () => {
  it("reutiliza D1 após expiração KV, sem nova IA nem escrita ad hoc", async () => {
    const h = await seed(); h.semanticCache.clear();
    h.ai.mockResolvedValue({ response: JSON.stringify(particular) }); h.ai.mockClear();
    const result = await createConference(h.env)(normalized());
    expect(result.resultado.checagem_textual).toBe("completa");
    expect(result.extracao?.sinais).toEqual([]);
    expect(result.resultado.motivos.some(m => m.codigo === "modalidade_particular_contraditoria")).toBe(false);
    expect(h.ai).not.toHaveBeenCalled();
    expect(await count(h.env.DB, "validations")).toBe(1);
    expect(await count(h.env.DB, "semantic_extractions")).toBe(1);
    expect(h.semanticCache.size).toBe(0);
  });

  it.each(["{", '[],"situacao":{}', '[{"tipo":"decisao_por_particular","evidencia":"Texto que nunca esteve na observação"}]'])
  ("payload persistido malformado/inválido fecha incompleta, mesmo com KV válido (%s)", async sinais => {
    const h = await seed();
    await h.env.DB.prepare("UPDATE semantic_extractions SET sinais_json=?").bind(sinais).run();
    h.ai.mockClear();
    const result = await createConference(h.env)(normalized({ numero_autorizacao: "" }));
    expect(result.resultado.checagem_textual).toBe("incompleta");
    expect(result.resultado.decisao).toBe("PENDENTE");
    expect(result.resultado.motivos.length).toBeGreaterThan(0);
    expect(result.extracao).toBeNull();
    expect(h.ai).not.toHaveBeenCalled();
  });

  it("D1 indisponível não aceita KV nem chama IA", async () => {
    const h = await seed(); const prepare = h.env.DB.prepare.bind(h.env.DB);
    h.env.DB.prepare = ((sql: string) => {
      if (sql.includes("FROM semantic_extractions")) throw new Error("database unavailable");
      return prepare(sql);
    }) as typeof h.env.DB.prepare;
    h.ai.mockClear();
    const result = await createConference(h.env)(normalized());
    expect(result.resultado.checagem_textual).toBe("incompleta");
    expect(result.extracao).toBeNull(); expect(h.ai).not.toHaveBeenCalled();
  });

  it("sem observação e acima do limite semântico não consultam D1 nem IA", async () => {
    const h = await httpHarness(); const prepare = h.env.DB.prepare.bind(h.env.DB);
    const reads: string[] = [];
    h.env.DB.prepare = ((sql: string) => {
      if (sql.includes("FROM semantic_extractions")) { reads.push(sql); throw new Error("must not read"); }
      return prepare(sql);
    }) as typeof h.env.DB.prepare;
    const conference = createConference(h.env);
    expect((await conference(normalized({ observacao_recepcao: " " }))).resultado.checagem_textual).toBe("nao_aplicavel");
    expect((await conference(normalized({ observacao_recepcao: "x".repeat(1001) }))).resultado.checagem_textual).toBe("incompleta");
    expect(reads).toEqual([]); expect(h.ai).not.toHaveBeenCalled();
  });

  it("leitura D1 travada termina incompleta sem aceitar resultado tardio", async () => {
    const h = await seed(); const prepare = h.env.DB.prepare.bind(h.env.DB);
    h.env.DB.prepare = ((sql: string) => sql.includes("FROM semantic_extractions")
      ? { bind: () => ({ first: () => new Promise(() => {}) }) } : prepare(sql)) as typeof h.env.DB.prepare;
    h.ai.mockClear(); vi.useFakeTimers();
    const running = createConference(h.env)(normalized());
    await vi.advanceTimersByTimeAsync(5001);
    expect((await running).resultado.checagem_textual).toBe("incompleta");
    expect(h.ai).not.toHaveBeenCalled();
  });

  it("o mesmo texto em outro convênio/procedimento não reutiliza a extração", async () => {
    const h = await seed(); h.semanticCache.clear();
    h.ai.mockResolvedValue({ response: JSON.stringify(particular) }); h.ai.mockClear();
    const conference = createConference(h.env);
    const differentAgreement = await conference(normalized({ convenio: "Outro convênio" }));
    const differentProcedure = await conference(normalized({ procedimento_codigo: "OUTRO" }));
    expect(differentAgreement.extracao?.sinais).toEqual(particular.sinais);
    expect(differentProcedure.extracao?.sinais).toEqual(particular.sinais);
    expect(differentAgreement.extracao?.observacaoHash).not.toBe(differentProcedure.extracao?.observacaoHash);
    expect(h.ai).toHaveBeenCalledTimes(2);
  });

  it("capturas de chamadas concorrentes no mesmo factory não se misturam", async () => {
    const h = await seed(); h.semanticCache.clear(); h.ai.mockClear();
    let release!: (value: { response: string }) => void;
    let started!: () => void; const entered = new Promise<void>(resolve => { started = resolve; });
    h.ai.mockImplementation(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const conference = createConference(h.env);
    const uncached = conference(normalized({ convenio: "Outro convênio" })); await entered;
    const persisted = await conference(normalized());
    release({ response: JSON.stringify(particular) });
    const inferred = await uncached;
    expect(persisted.extracao?.sinais).toEqual([]);
    expect(inferred.extracao?.sinais).toEqual(particular.sinais);
    expect(persisted.extracao?.observacaoHash).not.toBe(inferred.extracao?.observacaoHash);
    expect(h.ai).toHaveBeenCalledTimes(1);
  });

  it("persistência recusa payload divergente para a identidade existente sem escrever", async () => {
    const h = await seed();
    const conference = await createConference(h.env)(normalized());
    conference.extracao = { ...conference.extracao!, ...particular };
    await expect(prepararPersistenciaConferencia(h.env.DB, {
      guia: normalized({ id_guia: "DIVERGENT" }), conferencia: conference, regras: catalogo,
      agora: new Date().toISOString(), idempotencyKey: "divergent", importId: `manual:${catalogo.hash}`,
    })).rejects.toThrow(/divergente/);
    expect(await count(h.env.DB, "guide_revisions")).toBe(1);
    expect(await count(h.env.DB, "validations")).toBe(1);
  });
});
