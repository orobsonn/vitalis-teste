import { describe, expect, it, vi } from "vitest";
import csv from "../../docs/fontes/guias.csv?raw";
import { iniciarImportacao, importarLote } from "../../src/application/imports";
import { catalogo } from "../../src/application/runtime";
import { database } from "../http/support";

function input() {
  return { csv: csv.split(/\r?\n/).slice(0, 3).join("\n"), arquivoNome: "replay.csv",
    idempotencyKey: "replay-sem-batch", regras: catalogo, tamanhoChunk: 3,
    agora: "2026-09-25T12:00:00.000Z", conferir: vi.fn(async () => { throw new Error("AI não deve ser chamada no replay"); }) };
}

describe("replay de importação consulta a chave antes de montar escritas", () => {
  it("devolve lote existente sem batch e sem chamar IA, inclusive pela API que drena lotes novos", async () => {
    const db = database(), options = input();
    const initial = await iniciarImportacao(db, options);
    const batch = vi.fn(async () => { throw new Error("Replay tentou escrever no D1"); });
    db.batch = batch;
    await expect(iniciarImportacao(db, options)).resolves.toEqual(initial);
    await expect(importarLote(db, options)).resolves.toEqual({ lote: initial, progresso: initial.progresso });
    expect(batch).not.toHaveBeenCalled(); expect(options.conferir).not.toHaveBeenCalled();
  });

  it("CSV, regras ou tamanho de chunk divergentes devolvem conflito antes de qualquer batch", async () => {
    const db = database(), options = input();
    await iniciarImportacao(db, options);
    const batch = vi.fn(async () => { throw new Error("Conflito tentou escrever no D1"); });
    db.batch = batch;
    for (const changed of [{ ...options, csv: options.csv + "\nlinha diferente" },
      { ...options, regras: { ...catalogo, hash: "outro-ruleset" } }, { ...options, tamanhoChunk: 4 }]) {
      await expect(iniciarImportacao(db, changed)).rejects.toMatchObject({ name: "PublicError", status: 409 });
    }
    expect(batch).not.toHaveBeenCalled(); expect(options.conferir).not.toHaveBeenCalled();
  });

  it("uma falha na consulta da chave não vira cache miss nem permite escrita", async () => {
    const db = database(), options = input();
    const failure = new Error("D1 indisponível");
    db.prepare = () => { throw failure; };
    const batch = vi.fn(async () => []); db.batch = batch;
    await expect(iniciarImportacao(db, options)).rejects.toBe(failure);
    expect(batch).not.toHaveBeenCalled(); expect(options.conferir).not.toHaveBeenCalled();
  });

  it("uma corrida aceita somente a unicidade real do D1 e relê a mesma chave", async () => {
    const db = database(), options = input();
    const initial = await iniciarImportacao(db, options);
    const prepare = db.prepare.bind(db), originalBatch = db.batch.bind(db);
    let primeiraConsulta = true;
    db.prepare = (sql) => {
      const statement = prepare(sql);
      if (primeiraConsulta && sql === "SELECT id FROM imports WHERE idempotency_key = ?") {
        primeiraConsulta = false;
        // Simula outra instância vencendo a corrida após a consulta inicial.
        const bind = statement.bind.bind(statement);
        statement.bind = (...params) => {
          const bound = bind(...params);
          bound.first = async () => null;
          return bound;
        };
      }
      return statement;
    };
    const batch = vi.fn();
    db.batch = async <T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> => {
      batch();
      try { return await originalBatch<T>(statements); }
      catch (error) {
        if (error instanceof Error && error.message === "UNIQUE constraint failed: imports.idempotency_key") {
          // Envelope observado no D1 remoto em 25/09/2026.
          throw new Error(`D1_ERROR: ${error.message}: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)`);
        }
        throw error;
      }
    };
    await expect(iniciarImportacao(db, options)).resolves.toEqual(initial);
    expect(batch).toHaveBeenCalledTimes(1); expect(options.conferir).not.toHaveBeenCalled();
  });

  it.each([
    "D1_ERROR: database unavailable",
    "D1_ERROR: UNIQUE constraint failed: imports.idempotency_key: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)",
    "D1_ERROR: UNIQUE constraint failed: imports.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)",
    "D1_ERROR: UNIQUE constraint failed: import_lines.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)",
  ])("não transforma erro desconhecido ou outra constraint em replay: %s", async (message) => {
    const db = database(), options = input(), failure = new Error(message);
    db.batch = vi.fn(async () => { throw failure; });
    await expect(iniciarImportacao(db, options)).rejects.toBe(failure);
    expect(options.conferir).not.toHaveBeenCalled();
  });
});
