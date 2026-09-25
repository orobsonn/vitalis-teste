import { normalizarEmail } from "./identidade";
import { chaveDeSessao } from "./segredos";
import { assinarPayload, codificarBase64Url, lerSessaoDaRequisicao, NOME_COOKIE_SESSAO, TTL_MAXIMO_SESSAO_SEGUNDOS } from "./sessao";

export interface WebSession {
  userId: "demo";
  role: "demo";
  email: string;
  csrfToken: string;
}

export function randomToken(): string {
  return codificarBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function requireSession(request: Request, env: Env): Promise<WebSession | null> {
  try {
    const session = await lerSessaoDaRequisicao(env, request);
    if (!session || !env.DEMO_EMAIL?.trim()) return null;
    return { userId: "demo", role: "demo", email: normalizarEmail(env.DEMO_EMAIL), csrfToken: session.csrf };
  } catch { return null; }
}

export async function sessionCookie(env: Env): Promise<string> {
  const key = chaveDeSessao(env);
  if (!key) throw new Error("Configuração de autenticação indisponível");
  const now = Math.floor(Date.now() / 1000);
  const value = await assinarPayload(key, { v: 1, sub: "demo", iat: now, exp: now + TTL_MAXIMO_SESSAO_SEGUNDOS, csrf: randomToken() });
  return `${NOME_COOKIE_SESSAO}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${TTL_MAXIMO_SESSAO_SEGUNDOS}`;
}

export const expiredSessionCookie = `${NOME_COOKIE_SESSAO}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export function cookieValue(request: Request, name: string): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export function sameToken(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length > 256 || b.length > 256) return false;
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

/** Leaves the request body available to the API handler. */
export async function requireCsrf(request: Request, session: WebSession): Promise<boolean> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !sameOrigin(request)) return false;
  let token = request.headers.get("x-csrf-token");
  if (!token && (request.headers.get("content-type") ?? "").includes("form")) {
    try { const value = (await request.clone().formData()).get("csrf_token"); token = typeof value === "string" ? value : null; } catch { return false; }
  }
  return sameToken(token, session.csrfToken);
}
