import { PublicError } from "./errors";

/** Coordinate mutations across isolates, including reset. A crashed request releases by lease. */
export async function withOperationalLock<T>(db: D1Database, action: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  const now = Date.now();
  const acquired = await db.prepare(`INSERT INTO operational_locks(name,token,expires_at)
    VALUES ('guides',?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,
    expires_at=excluded.expires_at WHERE operational_locks.expires_at < ? RETURNING token`)
    .bind(token, now + 180_000, now).first<{ token: string }>();
  if (acquired?.token !== token) throw new PublicError(409, "Há outra operação em andamento. Aguarde e tente novamente.");
  try { return await action(); }
  finally { await db.prepare("DELETE FROM operational_locks WHERE name='guides' AND token=?").bind(token).run(); }
}
