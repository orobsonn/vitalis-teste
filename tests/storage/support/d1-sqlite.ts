// Fixture congelada — adaptador D1 de teste sobre o módulo embutido
// `node:sqlite` (julgamento J9). Reutilizado por tests/storage,
// tests/import e tests/reports.
//
// Reproduz a fronteira que a SUT escreve (`D1Database`):
//   - `prepare(sql).bind(...values)` com binds parametrizados;
//   - recusa de booleanos e `undefined` na fronteira, com `TypeError` e
//     `code === "ERR_INVALID_ARG_TYPE"` (fidelidade D1/node:sqlite);
//   - `run()`/`all()`/`first()` devolvem `D1Result`-like com `results`,
//     `meta.changes` e `meta.last_row_id`;
//   - `batch(statements)` é atômico: `BEGIN`, executa na ordem e `COMMIT`;
//     qualquer erro faz `ROLLBACK` total e propaga o erro original.
//
// Cada banco é `:memory:` e isolado; nada é compartilhado entre testes.
import { DatabaseSync } from "node:sqlite";

export interface ResultadoD1Like<T = unknown> {
  success: true;
  results: T[];
  meta: { changes: number; last_row_id: number };
}

interface ErroComCodigo extends TypeError {
  code?: string;
}

// Mesma forma do erro nativo: TypeError + ERR_INVALID_ARG_TYPE.
function erroDeBind(indice: number): ErroComCodigo {
  const erro = new TypeError(
    `Provided value cannot be bound to SQLite parameter ${indice + 1}.`,
  ) as ErroComCodigo;
  erro.code = "ERR_INVALID_ARG_TYPE";
  return erro;
}

// D1 recusa booleanos; `undefined` também não é um valor SQL bindável.
function validarValor(valor: unknown, indice: number): void {
  if (typeof valor === "boolean" || valor === undefined) {
    throw erroDeBind(indice);
  }
}

export class StatementD1Sqlite {
  private readonly banco: DatabaseSync;
  private readonly sql: string;
  private readonly valores: readonly unknown[];

  constructor(banco: DatabaseSync, sql: string, valores: readonly unknown[] = []) {
    this.banco = banco;
    this.sql = sql;
    this.valores = valores;
  }

  // D1 valida/recusa o valor no bind, antes de qualquer execução.
  bind(...values: unknown[]): StatementD1Sqlite {
    values.forEach((valor, indice) => validarValor(valor, indice));
    return new StatementD1Sqlite(this.banco, this.sql, values);
  }

  async run(): Promise<ResultadoD1Like> {
    const resultado = this.banco.prepare(this.sql).run(...this.valores);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(resultado.changes),
        last_row_id: Number(resultado.lastInsertRowid),
      },
    };
  }

  async all(): Promise<ResultadoD1Like> {
    const linhas = this.banco.prepare(this.sql).all(...this.valores);
    return { success: true, results: linhas, meta: { changes: 0, last_row_id: 0 } };
  }

  async first(): Promise<Record<string, unknown> | null> {
    const linha = this.banco.prepare(this.sql).get(...this.valores);
    return linha ?? null;
  }

  async batchResult(): Promise<ResultadoD1Like> {
    // D1 batch returns rows for SELECT and RETURNING, unlike sqlite.run().
    return /^\s*SELECT\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql)
      ? this.all() : this.run();
  }
}

export class BancoD1Sqlite {
  private readonly banco: DatabaseSync;

  constructor() {
    this.banco = new DatabaseSync(":memory:");
  }

  prepare(query: string): StatementD1Sqlite {
    return new StatementD1Sqlite(this.banco, query);
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    this.banco.exec(query);
    return { count: 1, duration: 0 };
  }

  // `DB.batch` do D1 roda os statements numa transação: ou todos, ou nenhum.
  async batch(statements: readonly unknown[]): Promise<ResultadoD1Like[]> {
    this.banco.exec("BEGIN");
    try {
      const resultados: ResultadoD1Like[] = [];
      for (const statement of statements) {
        if (!(statement instanceof StatementD1Sqlite)) {
          throw new TypeError("statement nao pertence ao adaptador D1 de teste");
        }
        resultados.push(await statement.batchResult());
      }
      this.banco.exec("COMMIT");
      return resultados;
    } catch (erro) {
      try {
        this.banco.exec("ROLLBACK");
      } catch {
        // preserva o erro original da violação
      }
      throw erro;
    }
  }

  close(): void {
    this.banco.close();
  }
}

export function criarBancoD1Sqlite(): D1Database {
  return new BancoD1Sqlite() as unknown as D1Database;
}
