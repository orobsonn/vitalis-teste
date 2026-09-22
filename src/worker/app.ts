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

/** Base fixa usada apenas para resolver segmentos de travessia (`.`/`..`). */
const BASE_CANONICA = "http://canonical.invalid";

/**
 * Representacao canonicalizada (percent-decoded) do pathname usada apenas para
 * classificar namespaces reservados. Retorna `undefined` quando o encoding e
 * invalido para que a classificacao falhe fechado (404 JSON, sem assets).
 *
 * A decodificacao pode revelar separadores (`%2f`) e travessia (`%2e%2e`) que o
 * parser de URL nao normaliza; por isso o caminho decodificado e resolvido
 * contra uma base fixa antes da classificacao. Assim `/x/%2e%2e%2fapi/x` vira
 * `/api/x` e nao escapa do namespace reservado.
 *
 * A resolucao e feita como caminho, nunca como referencia relativa: quando o
 * caminho decodificado comeca com `//`, a API de URL o interpretaria como
 * *network-path reference* (autoridade/host) e mudaria o pathname —
 * `/%2ffoo/api/x` viraria `/api/x` e bloquearia indevidamente navegacao
 * legitima para `//foo/api/x`. Prefixar `/.` mantem o caminho literal
 * (`new URL("/.//foo/api/x", base).pathname === "//foo/api/x"`) sem alterar a
 * resolucao normal de `.`/`..` (`/x/../api/x` continua `/api/x`).
 */
function pathnameCanonicalizado(url: string): string | undefined {
  let decodificado: string;

  try {
    decodificado = decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }

  try {
    // `?` e `#` decodificados sao caracteres de caminho (na URL original
    // vinham percent-encoded), entao sao re-encoded para nao truncarem o
    // caminho ao resolvermos `.`/`..`.
    const semDelimitadores = decodificado.replace(/[?#]/g, (caractere) =>
      encodeURIComponent(caractere),
    );
    // Evita que um caminho iniciado por `//` seja lido como network-path
    // reference (host), o que mascararia o caminho HTTP real.
    const comoCaminho = semDelimitadores.startsWith("//")
      ? `/.${semDelimitadores}`
      : semDelimitadores;
    return new URL(comoCaminho, BASE_CANONICA).pathname;
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
