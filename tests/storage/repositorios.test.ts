// Teste travado lt-batch-cas-mapeamento-leitura — congela os repositórios
// transacionais e a leitura do histórico (#ac-4, #ac-6, #ac-15):
//
//   Given a persisted guide and a versioned estado_global,
//   When a batch writes a valid statement followed by a failing statement and a
//   stale CAS is attempted,
//   Then the batch leaves zero partial rows, the stale CAS changes zero rows,
//   the winning version increments exactly once, boolean binds are refused, and
//   reading the still-current revision with its current validation returns the
//   same integer cents, ISO date and original cells.
//
// O barrel `src/storage/index.ts` entra por import.meta.glob (a forma com a
// extensão `.ts` é rejeitada pelo tsc com TS5097); a migration entra por `?raw`.
// O RED inicial é falha de asserção (barrel/migration ausentes), nunca erro de
// coleta/import. Sem `node:fs`, sem rede, sem dependências novas.
//
// Cobertura adicional do mesmo contrato aprovado (#ac-4, J1, centavos seguros,
// "consultas de linhas/status"), ausente na versão anterior deste arquivo:
//   - inserirRevisaoVigente/inserirValidacaoVigente recusam vigente = 0 sem
//     desativar a vigente anterior;
//   - inserirGuia recusa idGuia vazio ou só espaços (J1);
//   - inserirRevisaoVigente recusa centavos não seguros (MAX_SAFE_INTEGER+2, NaN);
//   - lerImportacao/lerLinhasDoLote devolvem metadados do lote e linhas tipadas.
// Nenhum desses itens já estava coberto por asserção anterior.
//
// Superfície congelada do barrel (todas as funções recebem `db: D1Database` como
// 1º argumento e são async):
//
//   executarBatchAtomico(db, statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>
//     Executa `db.batch`; qualquer statement com erro reverte TODOS os statements
//     do lote; o erro é propagado.
//   lerEstadoGlobal(db, chave): Promise<number | null>
//     Versão corrente da chave em estado_global.
//   reservarVersaoGlobal(db, { chave, versaoLida }): Promise<{ aplicado: boolean; versao: number | null }>
//     CAS: incrementa SOMENTE se a versão lida ainda for a corrente
//     (`WHERE chave = ? AND versao = ?`). versaoLida obsoleta ⇒
//     { aplicado: false, versao: <corrente> } e zero alterações; vencedora ⇒
//     { aplicado: true, versao: <nova> } e incremento exatamente uma vez;
//     versaoLida null inicializa a chave em 1.
//   inserirGuia(db, guia: GuiaPersistida): Promise<void>
//     Recusa `idGuia` vazio ou só espaços antes de qualquer SQL (J1: identidade
//     de armazenamento não vazia).
//   lerGuia(db, idGuia): Promise<GuiaPersistida | null>
//     Consulta por `id_guia` (identidade de armazenamento).
//   inserirRevisaoVigente(db, revisao: RevisaoPersistida): Promise<RevisaoPersistida>
//     No MESMO lote atômico: desativa a revisão vigente anterior e insere a nova.
//     A operação exige `vigente` exatamente 1 (0 e booleanos são recusados antes
//     de qualquer SQL); `entradaNormalizada.valorCentavos` precisa ser null ou
//     inteiro seguro.
//   lerRevisaoVigente(db, guiaId): Promise<RevisaoPersistida | null>
//   lerHistoricoRevisoes(db, guiaId): Promise<RevisaoPersistida[]>
//     Todas as revisões da guia, ordenadas por `numero` crescente.
//   inserirValidacaoVigente(db, validacao: ValidacaoPersistida): Promise<ValidacaoPersistida>
//     Mesmo padrão de vigência única por revisão (exige `vigente` exatamente 1).
//   lerValidacaoVigente(db, revisaoId): Promise<ValidacaoPersistida | null>
//   contarLinhasPorEstado(db, importId): Promise<ContagemLinhasImportacao>
//     { encontradas, pendentes, emAndamento, processadas, reaproveitadas,
//       comFalha } derivados de COUNT(*) agrupado por `estado` de import_lines
//     (fonte única de progresso); `encontradas` é o total físico.
//   lerImportacao(db, id): Promise<ImportacaoPersistida | null>
//     Metadados tipados do lote (`imports`); `null` para id inexistente.
//   lerLinhasDoLote(db, importId): Promise<LinhaImportacao[]>
//     Linhas do lote (`import_lines`) em ordem de `numero_linha`, com estado e posse.
//   traduzirConflitoUnicidade(erro): ResultadoTraducaoUnicidade
//     Parseia `UNIQUE constraint failed: t.c[, t.c]` ⇒
//     { tipo: "unicidade", tabela, colunas }; qualquer outro erro (FK, CHECK,
//     TypeError) ⇒ { tipo: "outro" }.
import { describe, expect, it } from "vitest";

import { MIGRATION_PATH, criarBanco, migracoes } from "./support/banco";

type TimestampIso = string;

interface GuiaPersistida {
  id: string;
  idGuia: string;
  importIdInicial: string;
  criadoEm: TimestampIso;
  atualizadoEm: TimestampIso;
}

interface RevisaoPersistida {
  id: string;
  guiaId: string;
  numero: number;
  vigente: 0 | 1;
  entradaOriginal: unknown;
  entradaNormalizada: unknown;
  conteudoHash: string;
  assinaturaDuplicidade?: string | null;
  importId?: string | null;
  idempotencyKey?: string | null;
  criadoEm: TimestampIso;
}

interface ValidacaoPersistida {
  id: string;
  revisaoId: string;
  sequencia: number;
  vigente: 0 | 1;
  decisao: "OK" | "PENDENTE";
  checagemTextual: "completa" | "incompleta" | "nao_aplicavel";
  referenciaTemporal?: string | null;
  regrasVersao: string;
  regrasHash: string;
  rulesetId: string;
  inferenciaModelo?: string | null;
  inferenciaPromptVersao?: string | null;
  orientacoes: unknown;
  limitacoes: unknown;
  extracaoId?: string | null;
  processadoEm: TimestampIso;
}

interface ContagemLinhasImportacao {
  encontradas: number;
  pendentes: number;
  emAndamento: number;
  processadas: number;
  reaproveitadas: number;
  comFalha: number;
}

interface ImportacaoPersistida {
  id: string;
  idempotencyKey: string;
  arquivoNome: string;
  arquivoHash: string;
  regrasVersao: string;
  regrasHash: string;
  status: "PROCESSANDO" | "CONCLUIDO" | "PARCIAL" | "FALHOU";
  tamanhoChunk: number;
  linhasEncontradas: number;
  iniciadoEm: TimestampIso;
  atualizadoEm: TimestampIso;
  concluidoEm: string | null;
}

interface LinhaImportacao {
  id: string;
  importId: string;
  numeroLinha: number;
  estado: "PENDENTE" | "EM_ANDAMENTO" | "PROCESSADO" | "REAPROVEITADO" | "FALHOU";
  linhaOriginal: string;
  originalJson: string | null;
  guiaId: string | null;
  revisaoId: string | null;
  motivo: string | null;
  dono: string | null;
  reservadoEm: string | null;
  atualizadoEm: TimestampIso;
}

type ResultadoTraducaoUnicidade =
  | { tipo: "unicidade"; tabela: string; colunas: string[] }
  | { tipo: "outro" };

interface ApiAprovada {
  executarBatchAtomico(
    db: D1Database,
    statements: D1PreparedStatement[],
  ): Promise<D1Result<unknown>[]>;
  lerEstadoGlobal(db: D1Database, chave: string): Promise<number | null>;
  reservarVersaoGlobal(
    db: D1Database,
    entrada: { chave: string; versaoLida: number | null },
  ): Promise<{ aplicado: boolean; versao: number | null }>;
  inserirGuia(db: D1Database, guia: GuiaPersistida): Promise<void>;
  lerGuia(db: D1Database, idGuia: string): Promise<GuiaPersistida | null>;
  inserirRevisaoVigente(
    db: D1Database,
    revisao: RevisaoPersistida,
  ): Promise<RevisaoPersistida>;
  lerRevisaoVigente(db: D1Database, guiaId: string): Promise<RevisaoPersistida | null>;
  lerHistoricoRevisoes(db: D1Database, guiaId: string): Promise<RevisaoPersistida[]>;
  inserirValidacaoVigente(
    db: D1Database,
    validacao: ValidacaoPersistida,
  ): Promise<ValidacaoPersistida>;
  lerValidacaoVigente(db: D1Database, revisaoId: string): Promise<ValidacaoPersistida | null>;
  contarLinhasPorEstado(db: D1Database, importId: string): Promise<ContagemLinhasImportacao>;
  lerImportacao(db: D1Database, id: string): Promise<ImportacaoPersistida | null>;
  lerLinhasDoLote(db: D1Database, importId: string): Promise<LinhaImportacao[]>;
  traduzirConflitoUnicidade(erro: unknown): ResultadoTraducaoUnicidade;
}

const modulosBarrel = import.meta.glob("../../src/storage/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada | undefined;

const AGORA = "2026-03-05T10:00:00.000Z";
const DEPOIS = "2026-03-05T10:05:00.000Z";

const ENTRADA_ORIGINAL = {
  id_guia: "G-2608-0030",
  unidade: "Unidade Centro",
  data_atendimento: "05/03/2026",
  paciente: "Paciente Ficticio",
  convenio: "Convenio Alfa",
  carteirinha: "000123456",
  cid: "M54.5",
  procedimento_codigo: "20103301",
  procedimento_descricao: "Fisioterapia",
  numero_autorizacao: "AUT-9001",
  autorizacao_validade: "30/04/2026",
  autorizacao_sessoes_limite: "10",
  sessao_numero_na_autorizacao: "3",
  profissional: "Profissional Ficticio",
  profissional_registro: "CREFITO-12345",
  valor: "320,00",
  observacao_recepcao: "Sessao realizada sem intercorrencias",
  data_lancamento: "05/03/2026",
};

const ENTRADA_NORMALIZADA = {
  id: "G-2608-0030",
  convenio: "Convenio Alfa",
  procedimentoCodigo: "20103301",
  numeroAutorizacao: "AUT-9001",
  valorCentavos: 32000,
  dataAtendimento: "2026-03-05",
};

function exigirApi(): ApiAprovada {
  expect(typeof api?.executarBatchAtomico).toBe("function");
  expect(typeof api?.lerEstadoGlobal).toBe("function");
  expect(typeof api?.reservarVersaoGlobal).toBe("function");
  expect(typeof api?.inserirGuia).toBe("function");
  expect(typeof api?.lerGuia).toBe("function");
  expect(typeof api?.inserirRevisaoVigente).toBe("function");
  expect(typeof api?.lerRevisaoVigente).toBe("function");
  expect(typeof api?.lerHistoricoRevisoes).toBe("function");
  expect(typeof api?.inserirValidacaoVigente).toBe("function");
  expect(typeof api?.lerValidacaoVigente).toBe("function");
  expect(typeof api?.contarLinhasPorEstado).toBe("function");
  expect(typeof api?.lerImportacao).toBe("function");
  expect(typeof api?.lerLinhasDoLote).toBe("function");
  expect(typeof api?.traduzirConflitoUnicidade).toBe("function");
  return api!;
}

async function abrirBanco(): Promise<D1Database> {
  expect(typeof api?.executarBatchAtomico).toBe("function");
  expect(Object.keys(migracoes)).toContain(MIGRATION_PATH);
  return criarBanco();
}

async function semearImport(db: D1Database, id: string, chave: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, chave, "guias.csv", "hash-arquivo", "regras-v1", "hash-regras", "PROCESSANDO", 25, 80, AGORA, AGORA, null)
    .run();
}

async function semearLinha(
  db: D1Database,
  linha: {
    id: string;
    importId: string;
    numeroLinha: number;
    estado: string;
    linhaOriginal: string;
    originalJson?: string | null;
    motivo?: string | null;
    dono?: string | null;
    reservadoEm?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, original_json, motivo, dono, reservado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      linha.id,
      linha.importId,
      linha.numeroLinha,
      linha.estado,
      linha.linhaOriginal,
      linha.originalJson ?? null,
      linha.motivo ?? null,
      linha.dono ?? null,
      linha.reservadoEm ?? null,
      AGORA,
    )
    .run();
}

async function semearRuleset(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO rulesets (id, versao, hash, conteudo_json, criado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, "regras-v1", `hash-${id}`, "{}", AGORA)
    .run();
}

async function semearRevisaoDireta(
  db: D1Database,
  id: string,
  guiaId: string,
  numero: number,
  vigente: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO guide_revisions (id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json, conteudo_hash, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, guiaId, numero, vigente, "{}", "{}", `hash-${id}`, AGORA)
    .run();
}

interface GuiaFixture {
  id: string;
  idGuia: string;
  importIdInicial: string;
  criadoEm: TimestampIso;
  atualizadoEm: TimestampIso;
}

function novaGuia(): GuiaFixture {
  return {
    id: "guia-1",
    idGuia: "G-2608-0030",
    importIdInicial: "imp-1",
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  };
}

function novaRevisao(sobrescrever: Partial<RevisaoPersistida> = {}): RevisaoPersistida {
  return {
    id: "rev-1",
    guiaId: "guia-1",
    numero: 1,
    vigente: 1,
    entradaOriginal: ENTRADA_ORIGINAL,
    entradaNormalizada: ENTRADA_NORMALIZADA,
    conteudoHash: "hash-1",
    criadoEm: AGORA,
    ...sobrescrever,
  };
}

describe("repositorios transacionais", () => {
  it("executarBatchAtomico reverte todos os statements quando um deles falha", async () => {
    const api = exigirApi();
    const db = await abrirBanco();

    const valido = db
      .prepare("INSERT INTO estado_global (chave, versao) VALUES (?, ?)")
      .bind("lote-rollback", 1);
    const invalido = db
      .prepare(
        `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind("imp-invalido", "chave-invalida", "guias.csv", "h", "v1", "hr", "INVALIDO", 25, 80, AGORA, AGORA, null);

    await expect(api.executarBatchAtomico(db, [valido, invalido])).rejects.toThrow(
      /CHECK constraint failed/,
    );

    const contagem = await db
      .prepare("SELECT COUNT(*) AS total FROM estado_global WHERE chave = ?")
      .bind("lote-rollback")
      .first<{ total: number }>();
    expect(contagem?.total).toBe(0);
    expect(await api.lerEstadoGlobal(db, "lote-rollback")).toBeNull();
  });

  it("reserva de versão global é CAS: vencedora incrementa uma vez e obsoleta não altera", async () => {
    const api = exigirApi();
    const db = await abrirBanco();

    const inicial = await api.reservarVersaoGlobal(db, {
      chave: "reivindicacao",
      versaoLida: null,
    });
    expect(inicial).toEqual({ aplicado: true, versao: 1 });
    expect(await api.lerEstadoGlobal(db, "reivindicacao")).toBe(1);

    const vencedora = await api.reservarVersaoGlobal(db, {
      chave: "reivindicacao",
      versaoLida: 1,
    });
    expect(vencedora).toEqual({ aplicado: true, versao: 2 });
    expect(await api.lerEstadoGlobal(db, "reivindicacao")).toBe(2);

    const obsoleta = await api.reservarVersaoGlobal(db, {
      chave: "reivindicacao",
      versaoLida: 1,
    });
    expect(obsoleta).toEqual({ aplicado: false, versao: 2 });
    expect(await api.lerEstadoGlobal(db, "reivindicacao")).toBe(2);

    const { results } = await db
      .prepare("SELECT chave, versao FROM estado_global WHERE chave = ?")
      .bind("reivindicacao")
      .all<{ chave: string; versao: number }>();
    expect(results).toHaveLength(1);
    expect(results[0].versao).toBe(2);
  });

  it("recusa binds booleanos no adaptador e em inserirRevisaoVigente sem gravar nada", async () => {
    const api = exigirApi();
    const db = await abrirBanco();

    let erroBind: unknown;
    try {
      db.prepare("INSERT INTO estado_global (chave, versao) VALUES (?, ?)").bind("boa", true);
    } catch (capturado) {
      erroBind = capturado;
    }
    expect(erroBind).toBeInstanceOf(TypeError);
    expect((erroBind as { code?: string }).code).toBe("ERR_INVALID_ARG_TYPE");

    const aposBindInvalido = await db
      .prepare("SELECT COUNT(*) AS total FROM estado_global")
      .all<{ total: number }>();
    expect(aposBindInvalido.results[0].total).toBe(0);

    await semearImport(db, "imp-1", "chave-1");
    await api.inserirGuia(db, novaGuia());
    await api.inserirRevisaoVigente(db, novaRevisao());

    const revisaoComBooleano: RevisaoPersistida = novaRevisao({
      id: "rev-2",
      numero: 2,
      vigente: true as unknown as 0 | 1,
      entradaOriginal: { ...ENTRADA_ORIGINAL, valor: "350,00" },
      entradaNormalizada: { ...ENTRADA_NORMALIZADA, valorCentavos: 35000 },
      conteudoHash: "hash-2",
      criadoEm: DEPOIS,
    });

    let erroRepo: unknown;
    try {
      await api.inserirRevisaoVigente(db, revisaoComBooleano);
    } catch (capturado) {
      erroRepo = capturado;
    }
    expect(erroRepo).toBeDefined();

    const vigente = await api.lerRevisaoVigente(db, "guia-1");
    expect(vigente?.id).toBe("rev-1");
    expect(vigente?.vigente).toBe(1);
    const historico = await api.lerHistoricoRevisoes(db, "guia-1");
    expect(historico).toHaveLength(1);
  });

  it("persiste e lê revisão vigente e validação vigente preservando células, centavos e ISO", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");
    await semearRuleset(db, "rs-1");

    await api.inserirGuia(db, novaGuia());
    const guia = await api.lerGuia(db, "G-2608-0030");
    expect(guia?.id).toBe("guia-1");
    expect(guia?.idGuia).toBe("G-2608-0030");

    await api.inserirRevisaoVigente(db, novaRevisao());
    await api.inserirValidacaoVigente(db, {
      id: "val-1",
      revisaoId: "rev-1",
      sequencia: 1,
      vigente: 1,
      decisao: "OK",
      checagemTextual: "completa",
      regrasVersao: "regras-v1",
      regrasHash: "hash-regras",
      rulesetId: "rs-1",
      orientacoes: ["manter"],
      limitacoes: [],
      processadoEm: AGORA,
    });

    const revisao = await api.lerRevisaoVigente(db, "guia-1");
    expect(revisao?.id).toBe("rev-1");
    expect(revisao?.numero).toBe(1);
    expect(revisao?.vigente).toBe(1);
    expect(revisao?.entradaOriginal).toEqual(ENTRADA_ORIGINAL);
    expect(revisao?.entradaNormalizada).toEqual(ENTRADA_NORMALIZADA);
    // J8: o instante é persistido/devolvido textual (sem Date.now interno).
    expect(typeof revisao?.criadoEm).toBe("string");
    expect(revisao?.criadoEm).toBe(AGORA);

    const original = revisao!.entradaOriginal as Record<string, unknown>;
    expect(Object.keys(original)).toHaveLength(18);
    expect(original.id_guia).toBe("G-2608-0030");
    expect(original.valor).toBe("320,00");

    const normalizada = revisao!.entradaNormalizada as {
      valorCentavos: number;
      dataAtendimento: string;
    };
    expect(Number.isInteger(normalizada.valorCentavos)).toBe(true);
    expect(normalizada.valorCentavos).toBe(32000);
    expect(normalizada.dataAtendimento).toBe("2026-03-05");

    const validacao = await api.lerValidacaoVigente(db, "rev-1");
    expect(validacao?.id).toBe("val-1");
    expect(validacao?.vigente).toBe(1);
    expect(validacao?.decisao).toBe("OK");
    expect(validacao?.checagemTextual).toBe("completa");

    await api.inserirRevisaoVigente(
      db,
      novaRevisao({
        id: "rev-2",
        numero: 2,
        entradaOriginal: { ...ENTRADA_ORIGINAL, valor: "350,00" },
        entradaNormalizada: { ...ENTRADA_NORMALIZADA, valorCentavos: 35000 },
        conteudoHash: "hash-2",
        criadoEm: DEPOIS,
      }),
    );

    const vigenteAgora = await api.lerRevisaoVigente(db, "guia-1");
    expect(vigenteAgora?.id).toBe("rev-2");
    expect(vigenteAgora?.vigente).toBe(1);

    const historico = await api.lerHistoricoRevisoes(db, "guia-1");
    expect(historico.map((revisaoItem) => revisaoItem.numero)).toEqual([1, 2]);
    expect(historico[0].vigente).toBe(0);
    expect(historico[1].vigente).toBe(1);
    expect(historico[0].entradaOriginal).toEqual(ENTRADA_ORIGINAL);
  });

  it("traduz somente conflito de unicidade e classifica FK como outro", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");
    await db
      .prepare(
        "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)",
      )
      .bind("guia-1", "G-2608-0030", "imp-1", AGORA, AGORA)
      .run();
    await semearRevisaoDireta(db, "rev-1", "guia-1", 1, 1);

    let erroUnicidade: unknown;
    try {
      await semearRevisaoDireta(db, "rev-2", "guia-1", 2, 1);
    } catch (capturado) {
      erroUnicidade = capturado;
    }
    expect(erroUnicidade).toBeDefined();
    expect((erroUnicidade as Error).message).toContain(
      "UNIQUE constraint failed: guide_revisions.guide_id",
    );
    expect(api.traduzirConflitoUnicidade(erroUnicidade)).toEqual({
      tipo: "unicidade",
      tabela: "guide_revisions",
      colunas: ["guide_id"],
    });

    let erroFk: unknown;
    try {
      await db
        .prepare(
          "INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind("linha-orfa", "imp-inexistente", 1, "PENDENTE", "crua", AGORA)
        .run();
    } catch (capturado) {
      erroFk = capturado;
    }
    expect(erroFk).toBeDefined();
    expect(api.traduzirConflitoUnicidade(erroFk)).toEqual({ tipo: "outro" });
  });

  it("conta linhas por estado a partir de import_lines", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");

    const estados = [
      "PENDENTE",
      "PENDENTE",
      "EM_ANDAMENTO",
      "PROCESSADO",
      "PROCESSADO",
      "PROCESSADO",
      "REAPROVEITADO",
      "FALHOU",
    ];

    for (let indice = 0; indice < estados.length; indice += 1) {
      await db
        .prepare(
          "INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          `linha-${indice + 1}`,
          "imp-1",
          indice + 1,
          estados[indice],
          `linha ${indice + 1}`,
          AGORA,
        )
        .run();
    }

    const contagem = await api.contarLinhasPorEstado(db, "imp-1");
    expect(contagem).toEqual({
      encontradas: 8,
      pendentes: 2,
      emAndamento: 1,
      processadas: 3,
      reaproveitadas: 1,
      comFalha: 1,
    });
  });

  it("recusa vigente = 0 nas operações de vigência sem desativar as vigentes anteriores (#ac-4)", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");
    await semearRuleset(db, "rs-1");
    await api.inserirGuia(db, novaGuia());
    await api.inserirRevisaoVigente(db, novaRevisao());
    await api.inserirValidacaoVigente(db, {
      id: "val-1",
      revisaoId: "rev-1",
      sequencia: 1,
      vigente: 1,
      decisao: "OK",
      checagemTextual: "completa",
      regrasVersao: "regras-v1",
      regrasHash: "hash-regras",
      rulesetId: "rs-1",
      orientacoes: [],
      limitacoes: [],
      processadoEm: AGORA,
    });

    // `vigente = 0` é um valor válido do tipo 0 | 1, mas incompatível com a
    // operação "Vigente": aceitar deixaria guia/revisão sem linha vigente.
    await expect(
      api.inserirRevisaoVigente(db, novaRevisao({ id: "rev-2", numero: 2, vigente: 0 })),
    ).rejects.toThrow(TypeError);
    await expect(
      api.inserirValidacaoVigente(db, {
        id: "val-2",
        revisaoId: "rev-1",
        sequencia: 2,
        vigente: 0,
        decisao: "OK",
        checagemTextual: "completa",
        regrasVersao: "regras-v1",
        regrasHash: "hash-regras",
        rulesetId: "rs-1",
        orientacoes: [],
        limitacoes: [],
        processadoEm: DEPOIS,
      }),
    ).rejects.toThrow(TypeError);

    const revisaoVigente = await api.lerRevisaoVigente(db, "guia-1");
    expect(revisaoVigente?.id).toBe("rev-1");
    expect(revisaoVigente?.vigente).toBe(1);
    expect(await api.lerHistoricoRevisoes(db, "guia-1")).toHaveLength(1);

    const validacaoVigente = await api.lerValidacaoVigente(db, "rev-1");
    expect(validacaoVigente?.id).toBe("val-1");
    expect(validacaoVigente?.vigente).toBe(1);
  });

  it("recusa idGuia vazio ou só espaços sem gravar guia (J1)", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");
    await api.inserirGuia(db, novaGuia());

    for (const identidade of ["", "   "]) {
      await expect(
        api.inserirGuia(db, { ...novaGuia(), id: "guia-invalida", idGuia: identidade }),
      ).rejects.toThrow(TypeError);
    }

    expect(await api.lerGuia(db, "   ")).toBeNull();
    const original = await api.lerGuia(db, "G-2608-0030");
    expect(original?.id).toBe("guia-1");
    const contagem = await db
      .prepare("SELECT COUNT(*) AS total FROM guides")
      .first<{ total: number }>();
    expect(contagem?.total).toBe(1);
  });

  it("recusa centavos não seguros sem gravar nem desativar a vigente (centavos seguros)", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-1", "chave-1");
    await api.inserirGuia(db, novaGuia());
    await api.inserirRevisaoVigente(db, novaRevisao());

    // MAX_SAFE_INTEGER + 2 perde exatidão no double e NaN vira null no JSON.
    for (const valorCentavos of [Number.MAX_SAFE_INTEGER + 2, Number.NaN]) {
      await expect(
        api.inserirRevisaoVigente(
          db,
          novaRevisao({
            id: "rev-2",
            numero: 2,
            entradaNormalizada: { ...ENTRADA_NORMALIZADA, valorCentavos },
            conteudoHash: "hash-2",
            criadoEm: DEPOIS,
          }),
        ),
      ).rejects.toThrow(TypeError);
    }

    const vigente = await api.lerRevisaoVigente(db, "guia-1");
    expect(vigente?.id).toBe("rev-1");
    expect(vigente?.vigente).toBe(1);
    expect(await api.lerHistoricoRevisoes(db, "guia-1")).toHaveLength(1);
  });

  it("lê metadados do lote e linhas tipadas em ordem de numero_linha (consultas de linhas/status)", async () => {
    const api = exigirApi();
    const db = await abrirBanco();
    await semearImport(db, "imp-lote", "chave-lote");

    // Inserção fora de ordem: a leitura precisa devolver por `numero_linha`.
    await semearLinha(db, {
      id: "linha-3",
      importId: "imp-lote",
      numeroLinha: 3,
      estado: "PROCESSADO",
      linhaOriginal: "linha 3",
      dono: "worker-b",
      reservadoEm: AGORA,
    });
    await semearLinha(db, {
      id: "linha-1",
      importId: "imp-lote",
      numeroLinha: 1,
      estado: "PENDENTE",
      linhaOriginal: "linha 1",
    });
    await semearLinha(db, {
      id: "linha-2",
      importId: "imp-lote",
      numeroLinha: 2,
      estado: "EM_ANDAMENTO",
      linhaOriginal: "linha 2",
      originalJson: '{"a":1}',
      motivo: "em processamento",
      dono: "worker-a",
      reservadoEm: AGORA,
    });

    const lote = await api.lerImportacao(db, "imp-lote");
    expect(lote).toEqual({
      id: "imp-lote",
      idempotencyKey: "chave-lote",
      arquivoNome: "guias.csv",
      arquivoHash: "hash-arquivo",
      regrasVersao: "regras-v1",
      regrasHash: "hash-regras",
      status: "PROCESSANDO",
      tamanhoChunk: 25,
      linhasEncontradas: 80,
      iniciadoEm: AGORA,
      atualizadoEm: AGORA,
      concluidoEm: null,
    });
    expect(await api.lerImportacao(db, "imp-inexistente")).toBeNull();

    const linhas = await api.lerLinhasDoLote(db, "imp-lote");
    expect(linhas.map((linha) => linha.numeroLinha)).toEqual([1, 2, 3]);
    expect(linhas.map((linha) => linha.id)).toEqual(["linha-1", "linha-2", "linha-3"]);
    expect(linhas[1]).toEqual({
      id: "linha-2",
      importId: "imp-lote",
      numeroLinha: 2,
      estado: "EM_ANDAMENTO",
      linhaOriginal: "linha 2",
      originalJson: '{"a":1}',
      guiaId: null,
      revisaoId: null,
      motivo: "em processamento",
      dono: "worker-a",
      reservadoEm: AGORA,
      atualizadoEm: AGORA,
    });
    expect(linhas[0].estado).toBe("PENDENTE");
    expect(linhas[0].dono).toBeNull();
    expect(linhas[0].reservadoEm).toBeNull();
    expect(linhas[2].estado).toBe("PROCESSADO");
    expect(linhas[2].dono).toBe("worker-b");
    expect(linhas[2].reservadoEm).toBe(AGORA);
  });
});
