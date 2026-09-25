import { beforeAll, describe, expect, it, vi } from "vitest";
import { criarBanco } from "../storage/support/banco";
import type { Hono } from "hono";

interface Session { userId: "demo"; role: "demo"; email: string; csrfToken: string }
interface AuthApi {
  createAuthRoutes(env: Env): Hono<{ Bindings: Env }>;
  requireSession(req: Request, env: Env): Promise<Session | null>;
  requireCsrf(req: Request, session: Session): Promise<boolean>;
  allowRateLimit(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }>;
}
const modules = import.meta.glob("../../src/auth/index.ts", { eager: true });
const api = Object.values(modules)[0] as AuthApi | undefined;
const origin = "https://vitalis.test";
const password = "ficticia-para-testes-123!";
const pepper = "pepper-apenas-teste-32-bytes-minimo";
const salt = new TextEncoder().encode("salt-apenas-teste-123456");
let hash: string;

function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
beforeAll(async () => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper + password), "PBKDF2", false, ["deriveBits"]);
  hash = base64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256)));
});

function auth(): AuthApi { expect(api).toBeDefined(); return api!; }
async function harness() {
  const kv = new Map<string, string>();
  const completeAuthorization = vi.fn(async () => ({ redirectTo: "https://client.test/callback?code=fake" }));
  const env = {
    DB: await criarBanco(), COOKIE_ENCRYPTION_KEY: "cookie-test-key-that-is-at-least-32-characters",
    DEMO_EMAIL: "Demo@Vitalis.Test", DEMO_PASSWORD_HASH: hash, DEMO_PASSWORD_SALT: base64(salt), AUTH_PASSWORD_PEPPER: pepper,
    OAUTH_KV: { get: async (key: string) => kv.get(key) ?? null, put: async (key: string, value: string) => { kv.set(key, value); }, delete: async (key: string) => { kv.delete(key); } },
    OAUTH_PROVIDER: {
      parseAuthRequest: async () => ({ clientId: "client-test", responseType: "code", redirectUri: "https://client.test/callback", scope: ["vitalis"], state: "client-state", codeChallenge: "a".repeat(43), codeChallengeMethod: "S256" }),
      lookupClient: async () => ({ clientId: "client-test", clientName: "Cliente de teste", redirectUris: ["https://client.test/callback"] }),
      completeAuthorization,
    },
  } as unknown as Env;
  const app = auth().createAuthRoutes(env);
  const request = (path: string, init?: RequestInit) => app.fetch(new Request(origin + path, init), env);
  return { env, request, kv, completeAuthorization };
}
async function form(response: Response) {
  const html = await response.text();
  const cookies = response.headers.get("set-cookie") ?? "";
  return { csrf: html.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? "", state: html.match(/name="state" value="([^"]+)"/)?.[1], cookie: cookies.split(";")[0], html };
}
function submit(input: { csrf: string; cookie: string; state?: string }, extra: Record<string, string> = {}, headers: Record<string, string> = {}): RequestInit {
  return { method: "POST", headers: { Origin: origin, Cookie: input.cookie, "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams({ csrf_token: input.csrf, ...(input.state ? { state: input.state } : {}), email: "demo@vitalis.test", password, ...extra }) };
}

describe("auth real: senha, sessão, CSRF e OAuth", () => {
  it("login válido emite sessão protegida, usa segredo PBKDF2 e rotaciona CSRF", async () => {
    const h = await harness(); const login = await form(await h.request("/login"));
    expect(login.html).toContain("autocomplete=\"current-password\"");
    const response = await h.request("/login", submit(login));
    expect(response.status).toBe(302);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-vitalis_session="); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=Lax"); expect(cookie).not.toContain("Domain=");
    const session = await auth().requireSession(new Request(origin, { headers: { Cookie: cookie.split(";")[0] } }), h.env);
    expect(session).toMatchObject({ userId: "demo", role: "demo", email: "demo@vitalis.test" });
    expect(session!.csrfToken).not.toBe(login.csrf);
  });
  it("nega senha errada, CSRF/Origin inválidos e credenciais de configuração ausentes", async () => {
    const h = await harness(); const login = await form(await h.request("/login"));
    const wrong = await h.request("/login", submit(login, { password: "errada" }));
    expect(wrong.status).toBe(401); expect(await wrong.text()).toContain("E-mail ou senha inválidos");
    expect((await h.request("/login", submit(login, { csrf_token: "forged" }))).status).toBe(403);
    expect((await h.request("/login", submit(login, {}, { Origin: "https://evil.test" }))).status).toBe(403);
    h.env.DEMO_PASSWORD_HASH = "";
    expect((await h.request("/login", submit(await form(await h.request("/login"))))).status).toBe(401);
  });
  it("verifica CSRF da sessão sem consumir corpo JSON e logout exige proteção", async () => {
    const h = await harness(); const response = await h.request("/login", submit(await form(await h.request("/login"))));
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const session = (await auth().requireSession(new Request(origin, { headers: { Cookie: cookie } }), h.env))!;
    const req = new Request(origin + "/api/test", { method: "POST", headers: { Origin: origin, "X-CSRF-Token": session.csrfToken }, body: "{}" });
    expect(await auth().requireCsrf(req, session)).toBe(true); expect(await req.text()).toBe("{}");
    expect((await h.request("/logout", { method: "POST", headers: { Cookie: cookie, Origin: origin } })).status).toBe(403);
    const logout = await h.request("/logout", { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CSRF-Token": session.csrfToken } });
    expect(logout.status).toBe(302); expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("sessão adulterada ou expirada falha fechada", async () => {
    const h = await harness(); const response = await h.request("/login", submit(await form(await h.request("/login"))));
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect(await auth().requireSession(new Request(origin, { headers: { Cookie: cookie.slice(0, -4) + "ZZZZ" } }), h.env)).toBeNull();
    const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now + 9 * 3600_000);
    try { expect(await auth().requireSession(new Request(origin, { headers: { Cookie: cookie } }), h.env)).toBeNull(); } finally { clock.mockRestore(); }
  });
  it("limite de login usa D1 e impõe dez tentativas por IP", async () => {
    const h = await harness();
    for (let i = 0; i < 10; i++) expect((await h.request("/login", submit(await form(await h.request("/login")), { password: "x" }))).status).toBe(401);
    const response = await h.request("/login", submit(await form(await h.request("/login"))));
    expect(response.status).toBe(429); expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("rate limit simultâneo admite exatamente o teto sem perder contagens", async () => {
    const h = await harness();
    const results = await Promise.all(Array.from({ length: 12 }, () => auth().allowRateLimit(h.env.DB, "concurrent:test", 10, 900)));
    expect(results.filter(r => r.allowed)).toHaveLength(10);
  });
  it("OAuth vincula estado ao navegador, mantém credencial errada recuperável e propaga identidade", async () => {
    const h = await harness(); const oauth = await form(await h.request("/authorize"));
    const other = await form(await h.request("/login"));
    expect((await h.request("/authorize", submit({ ...other, state: oauth.state }))).status).toBe(403);
    const invalid = await h.request("/authorize", submit(oauth, { password: "errada" }));
    expect(invalid.status).toBe(401); expect(h.completeAuthorization).not.toHaveBeenCalled();
    const retry = await form(invalid); expect(retry.csrf).not.toBe(oauth.csrf);
    const success = await h.request("/authorize", submit(retry));
    expect(success.status).toBe(302);
    expect(h.completeAuthorization).toHaveBeenCalledWith(expect.objectContaining({ userId: "demo", props: { userId: "demo", role: "demo", email: "demo@vitalis.test" } }));
    expect((await h.request("/authorize", submit(retry))).status).toBe(400);
  });
  it("OAuth concorrente permite uma única autorização mesmo com KV ainda visível", async () => {
    const h = await harness(); const oauth = await form(await h.request("/authorize"));
    const responses = await Promise.all([h.request("/authorize", submit(oauth)), h.request("/authorize", submit(oauth))]);
    expect(responses.map(r => r.status).sort()).toEqual([302, 400]); expect(h.completeAuthorization).toHaveBeenCalledTimes(1);
  });
  it("OAuth expirado ou erro do provider não expõe segredos e não libera consumo incerto", async () => {
    const h = await harness(); const oauth = await form(await h.request("/authorize"));
    h.completeAuthorization.mockRejectedValueOnce(new Error("SQL SECRET stack internal"));
    const failed = await h.request("/authorize", submit(oauth));
    expect(failed.status).toBe(503); expect(await failed.text()).not.toMatch(/SQL|SECRET|stack/);
    expect((await h.request("/authorize", submit(oauth))).status).toBe(400);
    const fresh = await form(await h.request("/authorize"));
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 601_000);
    try { expect((await h.request("/authorize", submit(fresh))).status).toBe(400); } finally { clock.mockRestore(); }
  });
  it("OAuth reutiliza sessão autenticada sem pedir senha novamente", async () => {
    const h = await harness();
    const login = await h.request("/login", submit(await form(await h.request("/login"))));
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const oauth = await form(await h.request("/authorize", { headers: { Cookie: cookie } }));
    expect(oauth.html).not.toContain('name="password"');
    const response = await h.request("/authorize", submit(oauth, { email: "", password: "" }, { Cookie: oauth.cookie + "; " + cookie }));
    expect(response.status).toBe(302); expect(h.completeAuthorization).toHaveBeenCalledTimes(1);
  });
  it("recusa corpo acima de 64 KiB, fluxo implicit e PKCE plain", async () => {
    const h = await harness();
    expect((await h.request("/login", { method: "POST", headers: { Origin: origin }, body: "x".repeat(65537) })).status).toBe(413);
    const good = await h.env.OAUTH_PROVIDER.parseAuthRequest(new Request(origin));
    h.env.OAUTH_PROVIDER.parseAuthRequest = async () => ({ ...good, responseType: "token" });
    expect((await h.request("/authorize")).status).toBe(400);
    h.env.OAUTH_PROVIDER.parseAuthRequest = async () => ({ ...good, codeChallengeMethod: "plain" });
    expect((await h.request("/authorize")).status).toBe(400);
    expect(h.kv.size).toBe(0);
  });
  it("CSP OAuth permite o callback validado sem ampliar a política do login", async () => {
    const h = await harness();
    const login = await h.request("/login");
    expect(login.headers.get("content-security-policy")).toContain("form-action 'self';");
    const authorization = await h.request("/authorize");
    expect(authorization.headers.get("content-security-policy")).toContain("form-action 'self' https://client.test;");
    expect(authorization.headers.get("content-security-policy")).not.toContain("form-action *");
  });
  it("formulários preservam Origin na navegação POST sem expor Referer a outro site", async () => {
    const h = await harness();
    for (const path of ["/login", "/authorize"]) {
      const response = await h.request(path);
      // Fetch append-request-Origin: no-referrer serializes Origin as null
      // for native form navigation; same-origin retains it only to our host.
      expect(response.headers.get("referrer-policy")).toBe("same-origin");
    }
    const login = await form(await h.request("/login"));
    expect((await h.request("/login", submit(login, {}, { Origin: "null" }))).status).toBe(403);
    expect((await h.request("/login", submit(login))).status).toBe(302);
  });
});
