import { sha256Hex } from "../shared/sha256";

/** Atomic shared fixed window. Only hashes of caller/IP scopes are retained. */
export async function allowRateLimit(
  db: D1Database, key: string, limit: number, windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
    throw new TypeError("Configuração de limite inválida");
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds;
  await db.prepare("DELETE FROM auth_rate_limits WHERE expires_at < ?").bind(now - 86400).run();
  const row = await db.prepare(
    "INSERT INTO auth_rate_limits (key_hash, hits, expires_at) VALUES (?, 1, ?) " +
    "ON CONFLICT(key_hash) DO UPDATE SET " +
    "hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END, " +
    "expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END " +
    "RETURNING hits, expires_at",
  ).bind(sha256Hex(JSON.stringify([key, limit, windowSeconds])), expiresAt, now, now)
    .first<{ hits: number; expires_at: number }>();
  return { allowed: row !== null && row.hits <= limit, retryAfter: Math.max(1, (row?.expires_at ?? expiresAt) - now) };
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "local";
}
