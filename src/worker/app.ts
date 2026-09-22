import { Hono } from "hono";
import type { Context } from "hono";

/** Nome do servico devolvido pelo probe de health. */
const SERVICO = "vitalis-conferencia-preventiva-guias";

/**
 * Namespaces reservados a API/OAuth/MCP: nunca sao navegacao e nunca podem
 * cair no fallback de assets, mesmo em GET.
 */
const NAMESPACES_RESERVADOS = [
  "/api",
  "/mcp",
  "/authorize",
  "/token",
  "/register",
  "/login",
  "/logout",
] as const;

function pertenceANamespaceReservado(pathname: string): boolean {
  return NAMESPACES_RESERVADOS.some(
    (namespace) => pathname === namespace || pathname.startsWith(`${namespace}/`),
  );
}

/**
 * Representacao canonicalizada (percent-decoded) do pathname usada apenas para
 * classificar namespaces reservados. Retorna `undefined` quando o encoding e
 * invalido para que a classificacao falhe fechado (404 JSON, sem assets).
 */
function pathnameCanonicalizado(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }
}

function pedeJson(c: Context<{ Bindings: Env }>): boolean {
  const accept = c.req.header("accept");
  return typeof accept === "string" && accept.toLowerCase().includes("application/json");
}

function notFoundJson(c: Context<{ Bindings: Env }>): Response {
  return c.json({ error: "not_found" }, 404);
}

/**
 * Constroi a aplicacao Hono compartilhada pelo Worker.
 *
 * Precedencia HTTP (spec §3.2): o probe `/health` responde JSON primeiro;
 * namespaces reservados e qualquer metodo nao GET viram 404 JSON sem tocar
 * assets; apenas GET de navegacao fora dos namespaces reservados, sem
 * `Accept: application/json`, e delegado uma unica vez a `env.ASSETS` depois
 * do roteamento (503 JSON quando o binding nao existe).
 */
export function createApp(env: Env): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Guard global de metodo registrado antes de qualquer rota: o Hono converte
  // HEAD em dispatch GET, entao `app.get("/health")` seria selecionado por
  // `HEAD /health`. Aqui o metodo original e inspecionado antes do roteamento.
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET") {
      return notFoundJson(c);
    }
    await next();
  });

  app.get("/health", (c) =>
    c.json({ status: "ok", service: SERVICO }, 200),
  );

  app.all("*", async (c) => {
    const pathname = pathnameCanonicalizado(c.req.url);

    if (c.req.method !== "GET" || pathname === undefined) {
      return notFoundJson(c);
    }

    if (pertenceANamespaceReservado(pathname)) {
      return notFoundJson(c);
    }

    if (pedeJson(c)) {
      return notFoundJson(c);
    }

    const assets = env.ASSETS;
    if (!assets) {
      return c.json({ error: "assets_unavailable" }, 503);
    }

    return assets.fetch(c.req.raw);
  });

  return app;
}
