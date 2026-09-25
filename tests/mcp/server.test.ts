import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Executor, ResolvedProvider } from "@cloudflare/codemode";
import { createVitalisMcpServer } from "../../src/mcp/server";
import type { VitalisHandlers } from "../../src/mcp/contratos";
import { COLUNAS_GUIA, carregarCatalogo, consultarRegra, normalizarGuia, verificarGuia, type GuiaOriginal } from "../../src/domain";
import { PublicError } from "../../src/application/errors";
import regrasJson from "../../docs/fontes/regras_convenio.json";

const recursos: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fechar of recursos.splice(0)) await fechar(); });
const catalogo = carregarCatalogo(regrasJson);
if (!catalogo.ok) throw new Error("Catálogo inválido");
const regras = catalogo.catalogo;

function normalizar(guia: Record<string, string | null | undefined>) {
  const original = Object.fromEntries(COLUNAS_GUIA.map((c) => [c, guia[c] ?? ""])) as unknown as GuiaOriginal;
  return normalizarGuia({ numero: 1, original, linhaOriginal: "" });
}

function handlersPadrao(): VitalisHandlers {
  return {
    consultarRegra: vi.fn((input) => consultarRegra(input, regras)),
    verificarGuia: vi.fn((input) => verificarGuia(normalizar(input.guia), regras)),
    registrarGuia: vi.fn(async () => ({ tipo: "criada", revisaoId: "revisao-ficticia" })),
  };
}

async function conectar(handlers = handlersPadrao(), executor: Executor = {
  execute: async () => ({ result: null }),
}) {
  const instancia = await createVitalisMcpServer(handlers, executor);
  const client = new Client({ name: "teste-vitalis", version: "1.0.0" });
  const [cliente, servidor] = InMemoryTransport.createLinkedPair();
  await instancia.server.connect(servidor);
  await client.connect(cliente);
  recursos.push(async () => { await client.close(); await instancia.close(); });
  return { client, handlers };
}

function conteudo(result: Awaited<ReturnType<Client["callTool"]>>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}

describe("MCP Vitalis com transporte real em memória", () => {
  it("descobre exatamente quatro ferramentas e sinaliza leitura/gravação", async () => {
    const { client } = await conectar();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["code", "consultar_regra", "registrar_guia", "verificar_guia"]);
    expect(tools.find((t) => t.name === "verificar_guia")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "registrar_guia")?.annotations?.readOnlyHint).toBe(false);
  });

  it("consulta preserva a observação literal, limitações e versão do catálogo", async () => {
    const input = { convenio: regras.convenios[0].nome, procedimento_codigo: regras.procedimentos[0].codigo };
    const { client } = await conectar();
    const retorno = conteudo(await client.callTool({ name: "consultar_regra", arguments: input }));
    const esperado = consultarRegra(input, regras);
    expect(retorno.observacao).toBe(esperado.observacao);
    expect(retorno.regras_versao).toBe(esperado.regrasVersao);
    expect(retorno.limitacoes).toEqual(esperado.limitacoes);
    expect(retorno.procedimento.valor_referencia_centavos).toBe(esperado.procedimento?.valorReferenciaCentavos);
  });

  it("guia inédita confere pelo núcleo sem chamar a porta de escrita", async () => {
    const input = { guia: { id_guia: "EXEMPLO-INEDITO-MCP", convenio: regras.convenios[0].nome, procedimento_codigo: regras.procedimentos[0].codigo, observacao_recepcao: "" } };
    const { client, handlers } = await conectar();
    const retorno = conteudo(await client.callTool({ name: "verificar_guia", arguments: input }));
    expect(retorno).toEqual(verificarGuia(normalizar(input.guia), regras));
    expect(retorno.decisao).toBe("PENDENTE");
    expect(handlers.registrarGuia).not.toHaveBeenCalled();
  });

  it("preserva a observação e ausências, sem aceitar campos extras ou valor numérico", async () => {
    const { client, handlers } = await conectar();
    const input = { guia: { observacao_recepcao: "  autorização verbal; confirmar amanhã.  ", paciente: null }, referencia_temporal: "2026-09-25" };
    await client.callTool({ name: "verificar_guia", arguments: input });
    expect(handlers.verificarGuia).toHaveBeenCalledWith(input);
    for (const guia of [{ valor: 10 }, { segredo: "nao" }]) {
      const result = await client.callTool({ name: "verificar_guia", arguments: { guia } });
      expect(result.isError).toBe(true);
    }
    expect(handlers.verificarGuia).toHaveBeenCalledTimes(1);
  });

  it("escrita direta encaminha a chave estável; chave ausente não chama o caso de uso", async () => {
    const { client, handlers } = await conectar();
    const input = { guia: { id_guia: "EXEMPLO-1" }, idempotency_key: "registro-exemplo-1" };
    await client.callTool({ name: "registrar_guia", arguments: input });
    await client.callTool({ name: "registrar_guia", arguments: input });
    expect(handlers.registrarGuia).toHaveBeenNthCalledWith(1, input);
    expect(handlers.registrarGuia).toHaveBeenNthCalledWith(2, input);
    expect((await client.callTool({ name: "registrar_guia", arguments: { guia: {} } })).isError).toBe(true);
    expect(handlers.registrarGuia).toHaveBeenCalledTimes(2);
  });

  it("code enxerga somente as duas leituras e compartilha o mesmo handler", async () => {
    const vistos: string[][] = [];
    const executor: Executor = {
      async execute(_code, providers) {
        const provider = (providers as ResolvedProvider[])[0];
        vistos.push(Object.keys(provider.fns));
        const result = await provider.fns.verificar_guia({ guia: { id_guia: "EXEMPLO-CODE" } });
        return { result };
      },
    };
    const { client, handlers } = await conectar(handlersPadrao(), executor);
    const result = await client.callTool({ name: "code", arguments: { code: "async () => await codemode.verificar_guia({guia:{id_guia:'EXEMPLO-CODE'}})" } });
    expect(result.isError).not.toBe(true);
    expect(vistos).toEqual([["consultar_regra", "verificar_guia"]]);
    expect(handlers.verificarGuia).toHaveBeenCalledWith({ guia: { id_guia: "EXEMPLO-CODE" } });
    expect(handlers.registrarGuia).not.toHaveBeenCalled();
  });

  it("conflito público de idempotência é explícito sem expor erro interno", async () => {
    const handlers = handlersPadrao();
    handlers.registrarGuia = vi.fn().mockRejectedValue(new PublicError(409, "Chave já usada com dados diferentes."));
    const { client } = await conectar(handlers);
    const result = await client.callTool({ name: "registrar_guia", arguments: { guia: {}, idempotency_key: "exemplo" } });
    expect(result.isError).toBe(true);
    expect(conteudo(result).error.status).toBe(409);
    expect(conteudo(result).error.mensagem).toContain("dados diferentes");
  });

  it("falha interna ou saída grande não expõe SQL, credencial nem conteúdo parcial", async () => {
    const handlers = handlersPadrao();
    handlers.verificarGuia = vi.fn().mockRejectedValueOnce(new Error("SELECT secret FROM tokens; senha=abcdef"))
      .mockResolvedValueOnce({ observacao_recepcao: "x".repeat(140_000) });
    const { client } = await conectar(handlers);
    const primeiro = await client.callTool({ name: "verificar_guia", arguments: { guia: {} } });
    const segundo = await client.callTool({ name: "verificar_guia", arguments: { guia: {} } });
    expect(primeiro.isError).toBe(true);
    expect(JSON.stringify(primeiro)).not.toMatch(/SELECT|abcdef|tokens/);
    expect(segundo.isError).toBe(true);
    expect(JSON.stringify(segundo).length).toBeLessThan(1000);
  });
});
