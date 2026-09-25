// Teste travado lt-esquema-unicidade-integridade — congela o esquema D1 e a
// integridade referencial (#ac-6):
//
//   Given a fresh node:sqlite D1 database with foreign keys enabled,
//   When the migration SQL is applied and duplicate imports.idempotency_key,
//   (import_id,numero_linha), a second vigente guide revision, a second vigente
//   validation or an orphan foreign key are inserted,
//   Then each conflicting insert fails with its expected UNIQUE or FK constraint
//   and the original persisted row remains unchanged.
//
// O barrel `src/storage/index.ts` entra por import.meta.glob (a forma com a
// extensão `.ts` é rejeitada pelo tsc com TS5097) e a migration por `?raw`. O
// RED inicial é falha de asserção (barrel/migration ausentes), nunca erro de
// coleta/import. Sem `node:fs`, sem rede, sem dependências novas.
import { describe, expect, it } from "vitest";

import { MIGRATION_PATH, criarBanco, migracoes } from "./support/banco";

interface ApiAprovada {
  executarBatchAtomico(...args: unknown[]): unknown;
}

const modulosBarrel = import.meta.glob("../../src/storage/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada | undefined;

const AGORA = "2026-03-05T10:00:00.000Z";

const TABELAS_ESPERADAS = [
  "rulesets",
  "estado_global",
  "imports",
  "import_lines",
  "import_chunks",
  "guides",
  "guide_revisions",
  "validations",
  "findings",
  "semantic_extractions",
];

const INDICES_ESPERADOS = [
  "ux_revisao_vigente",
  "ix_revisao_conteudo",
  "ix_revisao_assinatura",
  "ux_validacao_vigente",
];

// Primeira asserção de cada caso: comportamento no barrel e na migration
// ausentes.
async function abrirBanco(): Promise<D1Database> {
  expect(typeof api?.executarBatchAtomico).toBe("function");
  expect(Object.keys(migracoes)).toContain(MIGRATION_PATH);
  return criarBanco();
}

async function inserirImport(
  db: D1Database,
  id: string,
  idempotencyKey: string,
  status: string = "PROCESSANDO",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      idempotencyKey,
      "guias.csv",
      "hash-arquivo",
      "regras-v1",
      "hash-regras",
      status,
      25,
      80,
      AGORA,
      AGORA,
      null,
    )
    .run();
}

async function inserirGuia(
  db: D1Database,
  id: string,
  idGuia: string,
  importId: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, idGuia, importId, AGORA, AGORA)
    .run();
}

async function inserirRevisao(
  db: D1Database,
  id: string,
  guideId: string,
  numero: number,
  vigente: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO guide_revisions (id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json, conteudo_hash, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, guideId, numero, vigente, "{}", "{}", `hash-${id}`, AGORA)
    .run();
}

async function inserirRuleset(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO rulesets (id, versao, hash, conteudo_json, criado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, "regras-v1", `hash-${id}`, "{}", AGORA)
    .run();
}

async function inserirValidacao(
  db: D1Database,
  id: string,
  revisaoId: string,
  sequencia: number,
  vigente: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO validations (id, revision_id, sequencia, vigente, decisao, checagem_textual, regras_versao, regras_hash, ruleset_id, orientacoes_json, limitacoes_json, processado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, revisaoId, sequencia, vigente, "OK", "completa", "regras-v1", "hash-regras", "rs-1", "[]", "[]", AGORA)
    .run();
}

async function inserirLinha(
  db: D1Database,
  id: string,
  importId: string,
  numeroLinha: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, importId, numeroLinha, "PENDENTE", `linha ${numeroLinha}`, AGORA)
    .run();
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

describe("esquema e integridade", () => {
  it("aplica a migration com foreign keys ligadas e cria tabelas e índices", async () => {
    const db = await abrirBanco();

    const fk = await db.prepare("PRAGMA foreign_keys").first<{ foreign_keys: number }>();
    expect(fk?.foreign_keys).toBe(1);

    const { results } = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'",
      )
      .all<{ name: string }>();
    const nomes = results.map((linha) => linha.name);

    for (const tabela of TABELAS_ESPERADAS) {
      expect(nomes, `tabela ausente: ${tabela}`).toContain(tabela);
    }
    for (const indice of INDICES_ESPERADOS) {
      expect(nomes, `índice ausente: ${indice}`).toContain(indice);
    }
  });

  it("recusa idempotency_key duplicada em imports e preserva a linha original", async () => {
    const db = await abrirBanco();
    await inserirImport(db, "imp-1", "chave-unica");

    let erro: unknown;
    try {
      await inserirImport(db, "imp-2", "chave-unica");
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeDefined();
    expect(mensagem(erro)).toContain("UNIQUE constraint failed: imports.idempotency_key");

    const original = await db
      .prepare("SELECT id, idempotency_key, arquivo_nome, status FROM imports WHERE id = ?")
      .bind("imp-1")
      .first();
    expect(original?.id).toBe("imp-1");
    expect(original?.idempotency_key).toBe("chave-unica");
    expect(original?.arquivo_nome).toBe("guias.csv");
    expect(original?.status).toBe("PROCESSANDO");
  });

  it("recusa (import_id, numero_linha) duplicado em import_lines", async () => {
    const db = await abrirBanco();
    await inserirImport(db, "imp-1", "chave-1");
    await inserirLinha(db, "linha-1", "imp-1", 1);

    let erro: unknown;
    try {
      await inserirLinha(db, "linha-2", "imp-1", 1);
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeDefined();
    expect(mensagem(erro)).toContain(
      "UNIQUE constraint failed: import_lines.import_id, import_lines.numero_linha",
    );

    const original = await db
      .prepare("SELECT id, linha_original FROM import_lines WHERE import_id = ? AND numero_linha = ?")
      .bind("imp-1", 1)
      .first();
    expect(original?.id).toBe("linha-1");
    expect(original?.linha_original).toBe("linha 1");
  });

  it("impede segunda revisão vigente da mesma guia pelo índice parcial", async () => {
    const db = await abrirBanco();
    await inserirImport(db, "imp-1", "chave-1");
    await inserirGuia(db, "guia-1", "G-2608-0030", "imp-1");
    await inserirRevisao(db, "rev-1", "guia-1", 1, 1);

    let erro: unknown;
    try {
      await inserirRevisao(db, "rev-2", "guia-1", 2, 1);
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeDefined();
    expect(mensagem(erro)).toContain("UNIQUE constraint failed: guide_revisions.guide_id");

    const vigente = await db
      .prepare("SELECT id, vigente FROM guide_revisions WHERE guide_id = ? AND vigente = 1")
      .bind("guia-1")
      .first();
    expect(vigente?.id).toBe("rev-1");
    expect(vigente?.vigente).toBe(1);
  });

  it("impede segunda validação vigente da mesma revisão pelo índice parcial", async () => {
    const db = await abrirBanco();
    await inserirImport(db, "imp-1", "chave-1");
    await inserirGuia(db, "guia-1", "G-2608-0030", "imp-1");
    await inserirRevisao(db, "rev-1", "guia-1", 1, 1);
    await inserirRuleset(db, "rs-1");
    await inserirValidacao(db, "val-1", "rev-1", 1, 1);

    let erro: unknown;
    try {
      await inserirValidacao(db, "val-2", "rev-1", 2, 1);
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeDefined();
    expect(mensagem(erro)).toContain("UNIQUE constraint failed: validations.revision_id");

    const vigente = await db
      .prepare("SELECT id, vigente FROM validations WHERE revision_id = ? AND vigente = 1")
      .bind("rev-1")
      .first();
    expect(vigente?.id).toBe("val-1");
    expect(vigente?.vigente).toBe(1);
  });

  it("recusa foreign key órfão em import_lines e guide_revisions", async () => {
    const db = await abrirBanco();
    await inserirImport(db, "imp-1", "chave-1");

    let erroLinha: unknown;
    try {
      await inserirLinha(db, "linha-orfa", "imp-inexistente", 1);
    } catch (capturado) {
      erroLinha = capturado;
    }
    expect(erroLinha).toBeDefined();
    expect(mensagem(erroLinha)).toContain("FOREIGN KEY constraint failed");

    let erroRevisao: unknown;
    try {
      await inserirRevisao(db, "rev-orfa", "guia-inexistente", 1, 1);
    } catch (capturado) {
      erroRevisao = capturado;
    }
    expect(erroRevisao).toBeDefined();
    expect(mensagem(erroRevisao)).toContain("FOREIGN KEY constraint failed");
  });

  it("recusa CHECK de enum e de vigente inválidos", async () => {
    const db = await abrirBanco();

    let erroStatus: unknown;
    try {
      await inserirImport(db, "imp-invalido", "chave-invalida", "INVALIDO");
    } catch (capturado) {
      erroStatus = capturado;
    }
    expect(erroStatus).toBeDefined();
    expect(mensagem(erroStatus)).toContain("CHECK constraint failed");

    await inserirImport(db, "imp-1", "chave-1");
    await inserirGuia(db, "guia-1", "G-2608-0030", "imp-1");

    let erroVigente: unknown;
    try {
      await inserirRevisao(db, "rev-invalida", "guia-1", 1, 2);
    } catch (capturado) {
      erroVigente = capturado;
    }
    expect(erroVigente).toBeDefined();
    expect(mensagem(erroVigente)).toContain("CHECK constraint failed");
  });
});
