import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { normalizarEmail, verificarCredenciaisDemo } from "./identidade";
import { allowRateLimit, clientIp } from "./limits";
import { authPage } from "./page";
import { cookieValue, expiredSessionCookie, randomToken, requireCsrf, requireSession, sameOrigin, sameToken, sessionCookie } from "./session";

const CSRF_COOKIE = "__Host-vitalis_csrf";
const STATE_TTL = 600;
const GENERIC = "E-mail ou senha inválidos";
interface OAuthState { request: AuthRequest; csrf: string; expiresAt: number; clientName: string }

function securityHeaders(): Headers {
  // Native form POSTs use navigation mode. Fetch serializes their Origin as
  // null under no-referrer, preventing our strict same-origin CSRF check.
  // same-origin preserves that check and still hides Referer cross-origin.
  return new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
}

function page(input: { csrf: string; state?: string; clientName?: string; authenticated?: boolean; message?: string; redirectSource?: string }, status = 200): Response {
  const nonce = randomToken();
  const headers = securityHeaders();
  headers.set("Content-Type", "text/html; charset=UTF-8");
  headers.set("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'${input.redirectSource ? ` ${input.redirectSource}` : ""}; base-uri 'none'; frame-ancestors 'none'`);
  headers.set("Set-Cookie", `${CSRF_COOKIE}=${input.csrf}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL}`);
  return new Response(authPage({ ...input, nonce }), { status, headers });
}

function error(message: string, status: number): Response {
  const headers = securityHeaders();
  headers.set("Content-Type", "text/plain; charset=UTF-8");
  return new Response(message, { status, headers });
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function readForm(request: Request): Promise<FormData | null> {
  if (!sameOrigin(request)) return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded") && !contentType.startsWith("multipart/form-data")) return null;
  try {
    const form = await request.formData();
    const token = field(form, "csrf_token");
    return /^[A-Za-z0-9_-]{43}$/.test(token) && sameToken(token, cookieValue(request, CSRF_COOKIE)) ? form : null;
  } catch { return null; }
}

async function loginLimit(request: Request, env: Env): Promise<Response | null> {
  const result = await allowRateLimit(env.DB, `login:${clientIp(request)}`, 10, 900);
  if (result.allowed) return null;
  const response = error("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429);
  response.headers.set("Retry-After", String(result.retryAfter));
  return response;
}

async function authenticated(env: Env, form: FormData): Promise<boolean> {
  try {
    const email = field(form, "email");
    if (email.length > 254 || !env.COOKIE_ENCRYPTION_KEY || env.COOKIE_ENCRYPTION_KEY.length < 32) return false;
    return await verificarCredenciaisDemo(env, email, field(form, "password"));
  } catch { return false; }
}

async function oauthForm(env: Env, request: AuthRequest, clientName: string, options: { authenticated?: boolean; message?: string; status?: number } = {}): Promise<Response> {
  const state = crypto.randomUUID();
  const csrf = randomToken();
  const stored: OAuthState = { request, csrf, expiresAt: Math.floor(Date.now() / 1000) + STATE_TTL, clientName };
  await env.OAUTH_KV.put(`vitalis_oauth_state:${state}`, JSON.stringify(stored), { expirationTtl: STATE_TTL });
  // Chromium applies form-action to redirects after the POST too. Include only
  // the callback origin/scheme already approved against the registered client
  // by parseAuthRequest; never interpolate an untrusted URL into a CSP header.
  const callback = new URL(request.redirectUri);
  let redirectSource: string;
  if (callback.protocol === "https:" || callback.protocol === "http:") {
    redirectSource = callback.origin;
    if (!/^https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]+)?$/.test(redirectSource)) {
      throw new Error("Callback OAuth inválido");
    }
  } else {
    redirectSource = callback.protocol;
    if (!/^[a-z][a-z0-9+.-]*:$/.test(redirectSource) || ["javascript:", "data:", "file:", "blob:"].includes(redirectSource)) {
      throw new Error("Callback OAuth inválido");
    }
  }
  return page({ csrf, state, clientName, authenticated: options.authenticated, message: options.message, redirectSource }, options.status);
}

async function readState(env: Env, id: string): Promise<OAuthState | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const raw = await env.OAUTH_KV.get(`vitalis_oauth_state:${id}`);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as OAuthState;
    if (!state.request?.clientId || typeof state.csrf !== "string" || !Number.isSafeInteger(state.expiresAt) || state.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return state;
  } catch { return null; }
}

async function consumeState(env: Env, id: string, expiresAt: number): Promise<boolean> {
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;
  await env.DB.prepare("DELETE FROM oauth_state_consumptions WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)).run();
  const row = await env.DB.prepare("INSERT OR IGNORE INTO oauth_state_consumptions (state_id, expires_at) VALUES (?, ?) RETURNING state_id")
    .bind(id, expiresAt).first<{ state_id: string }>();
  return row !== null;
}

export function createAuthRoutes(env: Env): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: () => error("Corpo da requisição acima do limite.", 413) }));
  app.onError(() => error("Não foi possível concluir. Tente novamente.", 503));

  app.get("/login", async c => {
    if (await requireSession(c.req.raw, env)) return c.redirect("/", 302);
    return page({ csrf: randomToken() });
  });
  app.post("/login", async c => {
    const form = await readForm(c.req.raw);
    if (!form) return error("Requisição bloqueada.", 403);
    const limited = await loginLimit(c.req.raw, env);
    if (limited) return limited;
    if (!(await authenticated(env, form))) return page({ csrf: randomToken(), message: GENERIC }, 401);
    const headers = securityHeaders();
    headers.set("Location", "/"); headers.set("Set-Cookie", await sessionCookie(env));
    return new Response(null, { status: 302, headers });
  });
  app.post("/logout", async c => {
    const session = await requireSession(c.req.raw, env);
    if (!session || !(await requireCsrf(c.req.raw, session))) return error("Requisição bloqueada.", 403);
    const headers = securityHeaders();
    headers.set("Location", "/login"); headers.set("Set-Cookie", expiredSessionCookie);
    return new Response(null, { status: 302, headers });
  });

  app.get("/authorize", async c => {
    const provider = env.OAUTH_PROVIDER;
    if (!provider) return error("Solicitação de autorização inválida.", 400);
    const quota = await allowRateLimit(env.DB, `oauth-start:${clientIp(c.req.raw)}`, 60, 60);
    if (!quota.allowed) {
      const limited = error("Muitas solicitações. Tente novamente em breve.", 429);
      limited.headers.set("Retry-After", String(quota.retryAfter)); return limited;
    }
    let request: AuthRequest;
    let clientName: string;
    try {
      request = await provider.parseAuthRequest(c.req.raw);
      if (!request.clientId || !request.redirectUri || request.responseType !== "code" ||
          !/^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge ?? "") || request.codeChallengeMethod !== "S256") return error("Solicitação de autorização inválida.", 400);
      const client = await provider.lookupClient(request.clientId);
      if (!client) return error("Solicitação de autorização inválida.", 400);
      clientName = client.clientName || "seu assistente";
    } catch { return error("Solicitação de autorização inválida.", 400); }
    return oauthForm(env, request, clientName, { authenticated: Boolean(await requireSession(c.req.raw, env)) });
  });

  app.post("/authorize", async c => {
    const form = await readForm(c.req.raw);
    if (!form) return error("Requisição bloqueada.", 403);
    const id = field(form, "state");
    const state = await readState(env, id);
    if (!state) return error("Solicitação expirada ou já utilizada. Reinicie a conexão.", 400);
    if (!sameToken(state.csrf, field(form, "csrf_token"))) return error("Requisição bloqueada.", 403);
    const session = await requireSession(c.req.raw, env);
    if (!session) {
      const limited = await loginLimit(c.req.raw, env);
      if (limited) return limited;
      if (!(await authenticated(env, form))) {
        // Fresh state avoids eventual-consistency and per-key write limits when
        // rotating CSRF. No request credentials are reflected in the page.
        const response = await oauthForm(env, state.request, state.clientName, { message: GENERIC, status: 401 });
        await env.OAUTH_KV.delete(`vitalis_oauth_state:${id}`);
        return response;
      }
    }
    if (!env.OAUTH_PROVIDER) return error("Solicitação de autorização inválida.", 400);
    if (!(await consumeState(env, id, state.expiresAt))) return error("Solicitação expirada ou já utilizada. Reinicie a conexão.", 400);
    // Do not release this atomic claim after an uncertain provider failure:
    // authorization may have been persisted before the error was returned.
    try {
      const result = await env.OAUTH_PROVIDER.completeAuthorization({
        request: state.request, userId: "demo", metadata: { label: "Vitalis — demonstração" }, scope: state.request.scope,
        props: { userId: "demo", role: "demo", email: normalizarEmail(env.DEMO_EMAIL) },
      });
      // D1 claim already prevents replay if KV deletion is delayed/unavailable.
      try { await env.OAUTH_KV.delete(`vitalis_oauth_state:${id}`); } catch { /* expires automatically */ }
      const headers = securityHeaders(); headers.set("Location", result.redirectTo);
      if (!session) headers.set("Set-Cookie", await sessionCookie(env));
      return new Response(null, { status: 302, headers });
    } catch { return error("Não foi possível concluir a autorização. Reinicie a conexão no assistente.", 503); }
  });
  return app;
}
