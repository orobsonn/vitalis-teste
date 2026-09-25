import { DatabaseSync } from "node:sqlite";
import { createApp } from "../../src/worker/app";
import { sessionCookie } from "../../src/auth/session";
import { requireSession } from "../../src/auth";
import { vi } from "vitest";

const migrations = import.meta.glob("../../migrations/*.sql", { query: "?raw", eager: true, import: "default" });

/** SQLite executes actual SQL/FKs/transactions, including rows returned by SELECT in D1.batch. */
class Statement {
  constructor(readonly db: DatabaseSync, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { if (values.some(v => v === undefined || typeof v === "boolean")) throw new TypeError("Invalid D1 bind"); return new Statement(this.db, this.sql, values); }
  execute() {
    const results = this.db.prepare(this.sql).all(...this.values);
    const changes = this.db.prepare("SELECT changes() AS changes, last_insert_rowid() AS last_row_id").get()!;
    return { success: true, results, meta: { changes: Number(changes.changes), last_row_id: Number(changes.last_row_id) } };
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
}

export function database(): D1Database {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const [, sql] of Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b))) db.exec(String(sql));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    exec: async (sql: string) => { db.exec(sql); return { count: 1, duration: 0 }; },
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN");
      try { const rows = statements.map(s => s.execute()); db.exec("COMMIT"); return rows; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
}

export const origin = "https://vitalis.test";
export async function httpHarness() {
  const semanticCache = new Map<string, string>();
  const oauth = new Map<string, string>();
  const kv = (map: Map<string, string>) => ({ get: async (key: string) => map.get(key) ?? null, put: async (key: string, value: string) => { map.set(key, value); }, delete: async (key: string) => { map.delete(key); } });
  const ai = vi.fn(async (_model: string, _input: unknown) => ({ response: JSON.stringify({ sinais: [], situacao: { autorizacao: "nenhuma", modalidade: "nenhuma", procedimento: "nenhuma", reagendamento: "nenhum" }, ambiguidades: [] }) }));
  const assets = vi.fn(async () => new Response("app html", { headers: { "Content-Type": "text/html" } }));
  const env = { DB: database(), COOKIE_ENCRYPTION_KEY: "fictitious-cookie-key-at-least-32-characters", DEMO_EMAIL: "demo@vitalis.test", CACHE_SEMANTICO: kv(semanticCache), OAUTH_KV: kv(oauth), AI: { run: ai }, ASSETS: { fetch: assets } } as unknown as Env;
  const cookie = (await sessionCookie(env)).split(";")[0];
  const session = (await requireSession(new Request(origin, { headers: { Cookie: cookie } }), env))!;
  const app = createApp(env);
  const request = (path: string, init?: RequestInit) => app.fetch(new Request(origin + path, { ...init, headers: { Cookie: cookie, ...init?.headers } }), env);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => request(path, { method: "POST", body: JSON.stringify(body), headers: { Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken, ...headers } });
  return { env, cookie, session, request, post, ai, assets, oauth, semanticCache };
}

export async function count(db: D1Database, table: string): Promise<number> {
  return Number((await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>())!.total);
}
