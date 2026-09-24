// Declaração mínima local do módulo embutido `node:sqlite` do Node 22 (J9).
//
// O projeto não tem `@types/node` e criar dependência nova é proibido; este
// arquivo cobre apenas a superfície usada pelo adaptador D1 de teste
// (`tests/storage/support/d1-sqlite.ts`). Não é uma declaração completa.
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    run(...values: unknown[]): StatementResultingChanges;
    all(...values: unknown[]): Record<string, unknown>[];
    get(...values: unknown[]): Record<string, unknown> | undefined;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    enableForeignKeyConstraints?: boolean;
    readOnly?: boolean;
    allowExtension?: boolean;
    timeout?: number;
  }

  export class DatabaseSync {
    constructor(path?: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
