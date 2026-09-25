import { describe, expect, it } from "vitest";
import { traduzirConflitoUnicidade } from "../../src/storage/conflitos";

describe("conflito de unicidade no envelope D1", () => {
  it("aceita o sufixo SQLite de D1 para chave simples ou composta", () => {
    expect(traduzirConflitoUnicidade(new Error("D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT")))
      .toEqual({ tipo: "unicidade", tabela: "imports", colunas: ["idempotency_key"] });
    expect(traduzirConflitoUnicidade(new Error("D1_ERROR: UNIQUE constraint failed: import_lines.import_id, import_lines.numero_linha: SQLITE_CONSTRAINT")))
      .toEqual({ tipo: "unicidade", tabela: "import_lines", colunas: ["import_id", "numero_linha"] });
  });

  it("aceita o código estendido UNIQUE observado no D1 remoto", () => {
    expect(traduzirConflitoUnicidade(new Error("D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)")))
      .toEqual({ tipo: "unicidade", tabela: "imports", colunas: ["idempotency_key"] });
  });

  it.each([
    "D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT",
    "D1_ERROR: CHECK constraint failed: imports: SQLITE_CONSTRAINT",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_BUSY",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT; extra",
    "D1_ERROR: FOREIGN KEY constraint failed; UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key; DROP TABLE imports: SQLITE_CONSTRAINT",
    "D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)",
    "D1_ERROR: CHECK constraint failed: imports: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE); extra",
    "D1_ERROR: FOREIGN KEY constraint failed; UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)",
  ])("não promove erro diferente a replay: %s", (message) => {
    expect(traduzirConflitoUnicidade(new Error(message))).toEqual({ tipo: "outro" });
  });
});
