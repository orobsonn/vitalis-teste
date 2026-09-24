// Fixture congelada — criação de banco D1 de teste com a migration aplicada.
//
// A migration entra por `?raw` (sem `node:fs`), tolerante à ausência: um glob
// vazio não pode quebrar a coleta (o RED inicial é asserção, não import).
// `PRAGMA foreign_keys = ON` é ligado antes de qualquer escrita, como no D1 real.
import { criarBancoD1Sqlite } from "./d1-sqlite";

// Caminho relativo ao arquivo: tests/storage/support/ sobe três níveis até a raiz.
const modulosMigracao = import.meta.glob("../../../migrations/*.sql", {
  query: "?raw",
  eager: true,
  import: "default",
});

export const MIGRATION_PATH = "migrations/0001_importacao_historico_relatorio.sql";

// Chaves normalizadas para `migrations/<arquivo>.sql`, independentes do prefixo
// relativo que o glob devolve.
export const migracoes: Record<string, string> = Object.fromEntries(
  Object.entries(modulosMigracao).map(([caminho, conteudo]) => {
    const arquivo = caminho.split("/").pop() ?? caminho;
    return [`migrations/${arquivo}`, String(conteudo)];
  }),
);

export async function aplicarMigration(db: D1Database): Promise<void> {
  await db.exec("PRAGMA foreign_keys = ON");
  for (const sql of Object.values(migracoes)) {
    await db.exec(sql);
  }
}

export async function criarBanco(): Promise<D1Database> {
  const db = criarBancoD1Sqlite();
  await aplicarMigration(db);
  return db;
}
