import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpApiHandler } from "../../src/mcp/handler";
import type { VitalisHandlers } from "../../src/mcp/contratos";
import { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from "../../src/mcp/limites";

const fakes = vi.hoisted(() => ({
  createMcpHandler: vi.fn(), createServer: vi.fn(), executor: vi.fn(), close: vi.fn(),
}));
vi.mock("agents/mcp", () => ({ createMcpHandler: fakes.createMcpHandler }));
vi.mock("@cloudflare/codemode", () => ({
  DynamicWorkerExecutor: class { constructor(options: unknown) { fakes.executor(options); } },
}));
vi.mock("../../src/mcp/server", () => ({ createVitalisMcpServer: fakes.createServer }));

const actor = { userId: "demo", role: "demo", email: "demo@example.invalid" };
const env = { LOADER: {} as WorkerLoader };
const ctx = (props: unknown = actor) => ({ props } as unknown as ExecutionContext);
const handlers = {} as VitalisHandlers;
function request(body: string | ReadableStream<Uint8Array> = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}', headers?: HeadersInit) {
  return new Request("https://vitalis.example/mcp", {
    method: "POST", body, duplex: "half", headers: { "content-type": "application/json", ...headers },
  } as RequestInit);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.close.mockResolvedValue(undefined);
  fakes.createServer.mockResolvedValue({ server: {}, close: fakes.close });
  fakes.createMcpHandler.mockReturnValue(async () => Response.json({ result: { tools: [] } }));
});

describe("fronteira HTTP MCP", () => {
  it("recusa Origin externo/nulo/malformado antes de ferramentas e preserva origem própria e clientes nativos", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const allowRequest = vi.fn(async () => true);
    const handler = createMcpApiHandler({ createHandlers, allowRequest });
    for (const origin of ["https://example.invalid", "null", "https://vitalis.example.evil.invalid", "https://vitalis.example/path", "https://vitalis.example https://example.invalid"]) {
      expect((await handler.fetch(request(undefined, { origin }), env, ctx())).status).toBe(403);
    }
    expect(createHandlers).not.toHaveBeenCalled();
    expect(allowRequest).not.toHaveBeenCalled();
    expect((await handler.fetch(request(undefined, { origin: "https://vitalis.example" }), env, ctx())).status).toBe(200);
    expect((await handler.fetch(request(), env, ctx())).status).toBe(200);
  });

  it("recusa batches, escalares e envelopes JSON-RPC inválidos sem criar ferramentas", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const handler = createMcpApiHandler({ createHandlers, allowRequest: async () => true });
    for (const body of ["[]", '[{"jsonrpc":"2.0","id":1,"method":"tools/list"}]', "null", "true", '"texto"', "42", "{}", '{"jsonrpc":"2.0","method":1}']) {
      const response = await handler.fetch(request(body), env, ctx());
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32600 } });
    }
    expect(createHandlers).not.toHaveBeenCalled();
  });

  it("preserva envelopes válidos de requisição, notificação e resposta", async () => {
    const handler = createMcpApiHandler({ createHandlers: async () => handlers, allowRequest: async () => true });
    for (const body of [
      '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","id":1,"result":{}}',
      '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Unknown method"}}',
    ]) expect((await handler.fetch(request(body), env, ctx())).status).toBe(200);
  });

  it("rejeita props ausentes/inválidos antes de montar ferramentas", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const allowRequest = vi.fn(async () => true);
    const handler = createMcpApiHandler({ createHandlers, allowRequest });
    for (const props of [null, {}, { ...actor, userId: "outra-conta" }, { ...actor, role: "admin" }]) {
      expect((await handler.fetch(request(), env, ctx(props))).status).toBe(401);
    }
    expect(createHandlers).not.toHaveBeenCalled();
    expect(allowRequest).not.toHaveBeenCalled();
  });

  it("requer gate compartilhado e devolve retry-after antes de ler corpo", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const handler = createMcpApiHandler({ createHandlers, allowRequest: async () => false });
    const response = await handler.fetch(request(), env, ctx());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(createHandlers).not.toHaveBeenCalled();
  });

  it("rejeita corpo chunked maior que64KiB e JSON inválido sem refletir conteúdo", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const handler = createMcpApiHandler({ createHandlers, allowRequest: async () => true });
    const stream = new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(new Uint8Array(MAX_REQUEST_BYTES)); c.enqueue(new Uint8Array(1)); c.close();
    } });
    expect((await handler.fetch(request(stream), env, ctx())).status).toBe(413);
    const response = await handler.fetch(request("SENHA_QUE_NAO_PODE_SAIR"), env, ctx());
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("SENHA");
    expect(createHandlers).not.toHaveBeenCalled();
  });

  it("configura executor apenas com loader/timeout e encerra os recursos da requisição", async () => {
    const handler = createMcpApiHandler({ createHandlers: async () => handlers, allowRequest: async () => true });
    const response = await handler.fetch(request(), env, ctx());
    expect(response.status).toBe(200);
    expect(fakes.executor).toHaveBeenCalledWith({ loader: env.LOADER, timeout: 5000 });
    expect(fakes.createMcpHandler).toHaveBeenCalledWith({}, { route: "/mcp", enableJsonResponse: true });
    expect(fakes.close).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("falha fechada e resposta grande não vazam erro interno", async () => {
    const handler = createMcpApiHandler({ createHandlers: async () => handlers, allowRequest: async () => true });
    fakes.createMcpHandler.mockReturnValueOnce(async () => new Response("SQL token=segredo", { status: 500 }));
    const response = await handler.fetch(request(), env, ctx());
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal_error"}');
    fakes.createMcpHandler.mockReturnValueOnce(async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 1)));
    expect((await handler.fetch(request(), env, ctx())).status).toBe(413);
    expect(fakes.close).toHaveBeenCalledTimes(2);
  });

  it("rota irmã e GET não chegam ao protocolo nem aos assets", async () => {
    const createHandlers = vi.fn(async () => handlers);
    const handler = createMcpApiHandler({ createHandlers, allowRequest: async () => true });
    expect((await handler.fetch(new Request("https://vitalis.example/mcp/unknown"), env, ctx())).status).toBe(404);
    expect((await handler.fetch(new Request("https://vitalis.example/mcp"), env, ctx())).status).toBe(405);
    expect(createHandlers).not.toHaveBeenCalled();
  });
});
