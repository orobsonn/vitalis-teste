import type { McpActor, McpDependencies, McpEnv } from "./contratos";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { createVitalisMcpServer } from "./server";
import { CODE_TIMEOUT_MS, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, lerCorpoLimitado } from "./limites";

function erroHttp(status: number, error: string, headers?: Record<string, string>): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function lerActor(ctx: ExecutionContext): McpActor | null {
  const props: unknown = (ctx as ExecutionContext & { props?: unknown }).props;
  if (props === null || typeof props !== "object") return null;
  const candidato = props as Record<string, unknown>;
  if (candidato.userId !== "demo" || candidato.role !== "demo" || typeof candidato.email !== "string") return null;
  return { userId: "demo", role: "demo", email: candidato.email };
}

/** Exclusivo para apiHandler do OAuthProvider; nunca montar diretamente na SPA. */
export function createMcpApiHandler<E extends McpEnv>(deps: McpDependencies<E>) {
  return {
    async fetch(request: Request, env: E, ctx: ExecutionContext): Promise<Response> {
      if (new URL(request.url).pathname !== "/mcp") return erroHttp(404, "not_found");
      const actor = lerActor(ctx);
      if (!actor) return erroHttp(401, "unauthorized");
      // Clientes nativos não enviam Origin. Quando presente, deve ser a origem
      // deste Worker; validar explicitamente evita o default permissivo do SDK.
      const origin = request.headers.get("origin");
      if (origin !== null && origin !== new URL(request.url).origin) {
        return erroHttp(403, "invalid_origin");
      }
      // Servidor stateless: não mantém canal SSE ou sessão por conexão.
      if (request.method !== "POST") {
        return erroHttp(405, "method_not_allowed", { Allow: "POST" });
      }
      let instancia: Awaited<ReturnType<typeof createVitalisMcpServer>> | undefined;
      try {
        if (!await deps.allowRequest({ request, env, actor })) {
          return erroHttp(429, "rate_limit_exceeded", { "Retry-After": "60" });
        }
        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
          return erroHttp(415, "content_type_must_be_json");
        }
        let bytes: Uint8Array;
        try {
          bytes = await lerCorpoLimitado(request.body, MAX_REQUEST_BYTES);
        } catch {
          return erroHttp(413, "request_too_large");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          return erroHttp(400, "invalid_json");
        }
        // Streamable HTTP atual recebe uma única mensagem por POST. O SDK ainda
        // aceita batches legados e responde 202 para [], escondendo a invalidez.
        // Use seu schema canônico para requests, notifications e responses.
        if (!JSONRPCMessageSchema.safeParse(parsed).success) {
          return Response.json({ jsonrpc: "2.0", id: null,
            error: { code: -32600, message: "Envie uma única mensagem JSON-RPC válida." } },
          { status: 400, headers: { "Cache-Control": "no-store" } });
        }
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        const limitado = new Request(request.url, { method: request.method, headers, body: bytes as Uint8Array<ArrayBuffer> });
        const handlers = await deps.createHandlers({ env, actor });
        // Import tardio permite testar os contratos no Node sem emular Workers.
        const [{ DynamicWorkerExecutor }, { createMcpHandler }] = await Promise.all([
          import("@cloudflare/codemode"), import("agents/mcp"),
        ]);
        instancia = await createVitalisMcpServer(handlers, new DynamicWorkerExecutor({
          loader: env.LOADER,
          timeout: CODE_TIMEOUT_MS,
          // O default null bloqueia fetch/connect. Sem módulos/bindings extras.
        }));
        const resposta = await createMcpHandler(instancia.server, {
          route: "/mcp", enableJsonResponse: true,
        })(limitado, env, ctx);
        if (resposta.status >= 500) return erroHttp(500, "internal_error");
        let corpo: Uint8Array;
        try {
          corpo = await lerCorpoLimitado(resposta.body, MAX_RESPONSE_BYTES);
        } catch {
          return erroHttp(413, "response_too_large");
        }
        const responseHeaders = new Headers(resposta.headers);
        responseHeaders.set("Cache-Control", "no-store");
        responseHeaders.delete("content-length");
        return new Response(corpo.byteLength > 0 ? corpo as Uint8Array<ArrayBuffer> : null, {
          status: resposta.status, headers: responseHeaders,
        });
      } catch {
        return erroHttp(500, "internal_error");
      } finally {
        if (instancia) await instancia.close().catch(() => {});
      }
    },
  };
}
