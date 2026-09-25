import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVitalisMcpServer } from "../../src/mcp/server";
import { createVitalisHandlers } from "../../src/application/runtime";
import { criarBanco } from "../storage/support/banco";

const fechar: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of fechar.splice(0)) await f(); });
async function preparar() {
  const db = await criarBanco();
  const run = vi.fn(async () => { throw new Error("Este cenário não precisa de IA"); });
  const env = { DB: db, AI: { run }, CACHE_SEMANTICO: { get: async () => null, put: async () => {} } } as unknown as Env;
  const handlers = createVitalisHandlers({ env, actor: { userId: "demo" } });
  const instancia = await createVitalisMcpServer(handlers, { execute: async () => ({ result: null }) });
  const client = new Client({ name: "integracao-vitalis", version: "1.0.0" });
  const [cliente, servidor] = InMemoryTransport.createLinkedPair();
  await instancia.server.connect(servidor);
  await client.connect(cliente);
  fechar.push(async () => { await client.close(); await instancia.close(); });
  return { db, client, handlers, run };
}
function valor(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}
async function estado(db: D1Database) {
  const tabelas = ["guides", "guide_revisions", "validations", "findings", "imports", "semantic_extractions", "estado_global"];
  return Promise.all(tabelas.map(async (tabela) => (await db.prepare(`SELECT * FROM ${tabela}`).all()).results));
}
const entrada = { guia: { id_guia: "EXEMPLO-MCP-INEDITA", convenio: "Plano fictício desconhecido", procedimento_codigo: "EXEMPLO", observacao_recepcao: "" }, referencia_temporal: "2026-09-25" };

describe("MCP integrado ao runtime e D1", () => {
  it("consulta ad hoc tem paridade com o runtime sem inserir guias, lotes ou validações", async () => {
    const { db, client, handlers, run } = await preparar();
    const antes = await estado(db);
    const esperado = await handlers.verificarGuia(entrada);
    const result = await client.callTool({ name: "verificar_guia", arguments: entrada });
    expect(result.isError).not.toBe(true);
    expect(valor(result)).toEqual(esperado);
    expect(valor(result).persistida).toBe(false);
    expect(await estado(db)).toEqual(antes);
    expect(run).not.toHaveBeenCalled();
  });

  it("registro, retentativa e correção preservam uma guia e histórico com uma revisão vigente", async () => {
    const { db, client } = await preparar();
    const argumentos = { ...entrada, idempotency_key: "EXEMPLO-REGISTRO-1" };
    const criar = await client.callTool({ name: "registrar_guia", arguments: argumentos });
    expect(criar.isError, JSON.stringify(criar)).not.toBe(true);
    expect(valor(criar).tipo).toBe("criada");
    const repetir = await client.callTool({ name: "registrar_guia", arguments: argumentos });
    expect(valor(repetir).tipo).toBe("reaproveitada");
    expect(valor(repetir).revisaoId).toBe(valor(criar).revisaoId);
    const correcao = { ...argumentos, guia: { ...entrada.guia, unidade: "Centro" }, idempotency_key: "EXEMPLO-CORRECAO-1" };
    expect(valor(await client.callTool({ name: "registrar_guia", arguments: correcao })).tipo).toBe("criada");
    const rows = await db.prepare("SELECT numero, vigente FROM guide_revisions ORDER BY numero").all();
    expect(rows.results).toEqual([{ numero: 1, vigente: 0 }, { numero: 2, vigente: 1 }]);
    expect((await db.prepare("SELECT * FROM guides").all()).results).toHaveLength(1);
    const antigo = valor(await client.callTool({ name: "registrar_guia", arguments: argumentos }));
    expect(antigo.tipo).toBe("reaproveitada");
    expect((await db.prepare("SELECT numero FROM guide_revisions WHERE vigente=1").first())?.numero).toBe(2);
  });

  it("reusar chave com conteúdo diferente devolve409 e não cria outra revisão", async () => {
    const { db, client } = await preparar();
    const argumentos = { ...entrada, idempotency_key: "EXEMPLO-CONFLITO" };
    await client.callTool({ name: "registrar_guia", arguments: argumentos });
    const result = await client.callTool({ name: "registrar_guia", arguments: { ...argumentos, guia: { ...entrada.guia, unidade: "Outra" } } });
    expect(result.isError).toBe(true);
    expect(valor(result).error.status).toBe(409);
    expect((await db.prepare("SELECT * FROM guide_revisions").all()).results).toHaveLength(1);
  });
});
