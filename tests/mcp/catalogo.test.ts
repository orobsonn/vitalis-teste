import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVitalisMcpServer } from "../../src/mcp/server";
import { createVitalisHandlers, catalogo } from "../../src/application/runtime";
import { criarBanco } from "../storage/support/banco";

const fechar: Array<() => Promise<void>> = [];
afterEach(async () => { for (const f of fechar.splice(0)) await f(); });
async function conectar() {
  const db = await criarBanco();
  const run = vi.fn();
  const env = { DB: db, AI: { run }, CACHE_SEMANTICO: { get: async () => null, put: vi.fn() } } as unknown as Env;
  const instancia = await createVitalisMcpServer(createVitalisHandlers({ env, actor: { userId: "demo" } }), { execute: async () => ({ result: null }) });
  const client = new Client({ name: "catalogo-teste", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await instancia.server.connect(b); await client.connect(a);
  fechar.push(async () => { await client.close(); await instancia.close(); });
  const chamar = async (name: string, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    return result.structuredContent as any;
  };
  return { client, chamar, db, run };
}

describe("descoberta do catálogo pelo MCP", () => {
  it("lista convênios e permite navegar até a regra detalhada sem gravar", async () => {
    const { chamar, db, run } = await conectar();
    const antes = await db.prepare("SELECT * FROM estado_global").all();
    const lista = await chamar("listar_convenios");
    expect(lista.convenios.map((c: any) => c.nome)).toEqual(["Vitalcard", "Saúde Interior", "Plano Bem"]);
    expect(lista.convenios[0]).toMatchObject({ quantidade_procedimentos: 5, quantidade_cobertos: 4 });
    expect(lista.regras_versao).toBe(catalogo.regrasVersao);
    const resumo = await chamar("obter_convenio", { convenio: lista.convenios[0].nome });
    expect(resumo).toMatchObject({ convenio: "Vitalcard", limite_sessoes: 10, prazo_envio_dias: 30, validade_maxima_dias: 30 });
    expect(resumo.campos_obrigatorios).toContain("cid");
    expect(resumo.observacao).toBe(catalogo.convenios[0].observacao);
    expect(resumo.limitacoes).toEqual(catalogo.limitacoesGlobais);
    const regra = await chamar("consultar_regra", { convenio: resumo.convenio, procedimento_codigo: resumo.procedimentos[0].codigo });
    expect(regra.cobertura).toBe(resumo.procedimentos[0].cobertura);
    expect(await db.prepare("SELECT * FROM guides").all()).toMatchObject({ results: [] });
    expect(await db.prepare("SELECT * FROM estado_global").all()).toEqual(antes);
    expect(run).not.toHaveBeenCalled();
  });
  it("lista cobertura e valores com paginação e filtro explícitos", async () => {
    const { chamar } = await conectar();
    const pagina = await chamar("listar_procedimentos", { convenio: "  VITALCARD ", limite: 2 });
    expect(pagina).toMatchObject({ convenio: "Vitalcard", total: 5, proximo_offset: 2 });
    expect(pagina.procedimentos[0]).toMatchObject({ codigo: "50000470", cobertura: "coberto", valor_referencia_centavos: 6200 });
    const ultima = await chamar("listar_procedimentos", { convenio: "Vitalcard", offset: 4, limite: 2 });
    expect(ultima).toMatchObject({ proximo_offset: null, procedimentos: [{ codigo: "40201015", cobertura: "nao_coberto" }] });
    expect((await chamar("listar_procedimentos", { convenio: "Plano Bem", cobertura: "coberto" })).total).toBe(3);
    expect((await chamar("obter_convenio", { convenio: "Plano Bem", limite: 1 })).proximo_offset).toBe(1);
  });
  it("busca palavras sem acentos/capitalização e código, sem presumir cobertura", async () => {
    const { chamar } = await conectar();
    const busca = await chamar("buscar_procedimentos", { convenio: "saude interior", termo: "FISIOTERAPIA MUSCULOESQUELETICA" });
    expect(busca).toMatchObject({ total: 1, procedimentos: [{ codigo: "50000470", cobertura: "coberto" }] });
    expect((await chamar("buscar_procedimentos", { convenio: "Plano Bem", termo: "ortopedica" })).procedimentos[0].cobertura).toBe("nao_coberto");
    expect((await chamar("buscar_procedimentos", { convenio: "Plano Bem", termo: "50000470" })).total).toBe(1);
    expect((await chamar("buscar_procedimentos", { convenio: "Plano Bem", termo: "inexistente" })).total).toBe(0);
  });
  it("recusa convênio desconhecido e parâmetros inválidos", async () => {
    const { client } = await conectar();
    const erro = await client.callTool({ name: "obter_convenio", arguments: { convenio: "inexistente" } });
    expect(erro.isError).toBe(true);
    expect(erro.structuredContent).toMatchObject({ error: { status: 404 } });
    for (const args of [{ convenio: " " }, { convenio: "Vitalcard", offset: -1 }, { convenio: "Vitalcard", limite: 101 }, { convenio: "Vitalcard", limite: 1.5 }, { convenio: "Vitalcard", extra: true }]) {
      expect((await client.callTool({ name: "listar_procedimentos", arguments: args })).isError).toBe(true);
    }
    expect((await client.callTool({ name: "buscar_procedimentos", arguments: { convenio: "Vitalcard", termo: " " } })).isError).toBe(true);
  });
});
