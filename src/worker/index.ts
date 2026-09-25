import { createApp } from "./app";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpApiHandler } from "../mcp";
import { createVitalisHandlers } from "../application/runtime";
import { allowRateLimit } from "../auth";
import { boundedRequest } from "../http/body";
import { sha256Hex } from "../shared/sha256";

/**
 * Entrypoint do Worker declarado em `wrangler.jsonc` (`main`).
 *
 * Apenas adapta `fetch` para a aplicacao criada por `createApp(env)`.
 */
const mcp = createMcpApiHandler<Env>({
  createHandlers: createVitalisHandlers,
  allowRequest: async ({ request, env, actor }) => {
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    return (await allowRateLimit(env.DB, `mcp:${actor.userId}:${sha256Hex(ip)}`, 60, 60)).allowed;
  },
});

const provider = new OAuthProvider<Env>({
  apiRoute: "/mcp", apiHandler: mcp,
  defaultHandler: { fetch: (request, env, ctx) => createApp(env).fetch(request, env, ctx) },
  authorizeEndpoint: "/authorize", tokenEndpoint: "/token", clientRegistrationEndpoint: "/register",
  accessTokenTTL: 86_400, refreshTokenTTL: 2_592_000,
});

export default {
  async fetch(request, env, ctx) {
    const bounded = await boundedRequest(request);
    if (bounded instanceof Response) return bounded;
    return provider.fetch(bounded, env, ctx);
  },
} satisfies ExportedHandler<Env>;
