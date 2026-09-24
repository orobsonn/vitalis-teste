// Teste travado lt-estoque-unicidade-valores (#ac-10, #ac-14):
//
//   Given revisões vigente e obsoleta, uma guia com dois findings, um grupo com
//   dois valores válidos e outro grupo com valor ilegível, e linhas FALHOU,
//   When `relatorioEstoque` é lido,
//   Then cada guia/valor vigente conta uma única vez, `porCodigo` registra
//   ocorrências SOBREPONÍVEIS, a exposição é a soma das partições exclusivas
//   (estruturada + textual/duplicidade), o excesso potencial é
//   `total do grupo − menor valor válido` SEM entrar na exposição, o grupo
//   ilegível fica fora do excesso com `possivelExcessoIncompleto=true`, o valor
//   ilegível fica fora das somas com `totalIncompleto=true`, e
//   `falhasProcessamento` conta TODAS as linhas FALHOU.
//
// O barrel `src/reports/index.ts` entra por `import.meta.glob` (a SUT ainda não
// existe): a primeira asserção é de superfície, de modo que o RED é falha de
// asserção, nunca erro de coleta/import. A fixture usa apenas módulos e fixtures
// já integrados (`tests/storage/support/banco`), sem `node:fs`, sem rede, sem
// relógio de parede e sem dependência nova. A semeadura é SQL parametrizada
// direta em D1 para controlar exatamente cada valor, grupo e finding.
import { describe, expect, it } from "vitest";

import { criarBanco } from "../storage/support/banco";

// ---------------------------------------------------------------------------
// Superfície congelada do barrel da SUT (interface local; nunca import estático)
// ---------------------------------------------------------------------------

interface OpcoesRelatorioEstoque {
  agora: string;
  referencia?: string;
}

interface OpcoesRelatorioAtividade {
  de: string;
  ate: string;
  agora: string;
  referencia?: string;
}

interface ContagemCodigo {
  guias: number;
  ocorrencias: number;
}

interface RelatorioGuias {
  guias: number;
  ok: number;
  pendentes: number;
  falhasProcessamento: number;
  lotesProcessando: number;
  valorRegistradoCentavos: number;
  totalIncompleto: boolean;
  exposicaoCentavos: number;
  exposicaoEstruturadaCentavos: number;
  exposicaoTextualDuplicidadeCentavos: number;
  possivelExcessoCentavos: number;
  possivelExcessoIncompleto: boolean;
  valorSemPendenciaCentavos: number;
  porCodigo: Record<string, ContagemCodigo>;
  porConvenio: Record<string, number>;
  porUnidade: Record<string, number>;
  referenciasTemporais: string[];
  periodo: { de: string | null; ate: string | null };
  referencia: string | null;
}

interface ApiAprovada {
  relatorioEstoque(db: D1Database, opcoes?: OpcoesRelatorioEstoque): Promise<RelatorioGuias>;
  relatorioAtividade(db: D1Database, opcoes: OpcoesRelatorioAtividade): Promise<RelatorioGuias>;
}

const modulos = import.meta.glob("../../src/reports/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.relatorioEstoque).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Semeadura determinística em D1
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";
const FORA_DA_JANELA = "2026-09-30T00:00:00.000Z";
const RULESET_ID = "rs-relatorios";
const IMPORT_BASE = "imp-base";

interface SementeRevisao {
  guiaId: string;
  idGuia: string;
  revisaoId: string;
  numero: number;
  vigente: boolean;
  valorCentavos: number | null;
  convenio: string;
  unidade: string;
  dataLancamento: string | null;
  assinatura: string | null;
  decisao: "OK" | "PENDENTE";
  referenciaTemporal: string | null;
  processadoEm: string;
  codigos: string[];
}

function dataCivil(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.split("-").map((parte) => Number.parseInt(parte, 10));
  return { ano, mes, dia };
}

/**
 * `entrada_normalizada_json` realista: carrega `valorCentavos`/`convenio`/
 * `unidade`/`dataLancamento` (a projeção do relatório) e também `original` com a
 * célula crua `data_lancamento`, de modo que a fixture não dependa de um único
 * caminho de leitura.
 */
function entradaNormalizada(s: SementeRevisao): string {
  const valorTexto =
    s.valorCentavos === null ? "valor-ilegivel" : (s.valorCentavos / 100).toFixed(2);
  return JSON.stringify({
    id: s.idGuia,
    valorCentavos: s.valorCentavos,
    convenio: s.convenio,
    unidade: s.unidade,
    dataLancamento: s.dataLancamento === null ? null : dataCivil(s.dataLancamento),
    original: {
      id_guia: s.idGuia,
      unidade: s.unidade,
      convenio: s.convenio,
      valor: valorTexto,
      data_lancamento: s.dataLancamento ?? "",
    },
  });
}

async function semearBase(db: D1Database): Promise<void> {
  await db
    .prepare(
      "INSERT INTO rulesets (id, versao, hash, conteudo_json, criado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(RULESET_ID, "relatorios-v1", "hash-relatorios", "{}", AGORA)
    .run();
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      IMPORT_BASE,
      "K-base",
      "base.csv",
      "hash-arquivo",
      "relatorios-v1",
      "hash-relatorios",
      "CONCLUIDO",
      25,
      0,
      AGORA,
      AGORA,
      AGORA,
    )
    .run();
}

async function semearGuia(db: D1Database, guiaId: string, idGuia: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(guiaId, idGuia, IMPORT_BASE, AGORA, AGORA)
    .run();
}

async function semearRevisao(db: D1Database, s: SementeRevisao): Promise<void> {
  await db
    .prepare(
      `INSERT INTO guide_revisions (id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json, conteudo_hash, assinatura_duplicidade, import_id, idempotency_key, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      s.revisaoId,
      s.guiaId,
      s.numero,
      s.vigente ? 1 : 0,
      "{}",
      entradaNormalizada(s),
      `${s.revisaoId}-hash`,
      s.assinatura,
      null,
      null,
      AGORA,
    )
    .run();
  const validacaoId = `${s.revisaoId}-val`;
  await db
    .prepare(
      `INSERT INTO validations (id, revision_id, sequencia, vigente, decisao, checagem_textual, referencia_temporal, regras_versao, regras_hash, ruleset_id, inferencia_modelo, inferencia_prompt_versao, orientacoes_json, limitacoes_json, extracao_id, processado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      validacaoId,
      s.revisaoId,
      1,
      1,
      s.decisao,
      "nao_aplicavel",
      s.referenciaTemporal,
      "relatorios-v1",
      "hash-relatorios",
      RULESET_ID,
      null,
      null,
      "[]",
      "[]",
      null,
      s.processadoEm,
    )
    .run();
  for (let indice = 0; indice < s.codigos.length; indice += 1) {
    await db
      .prepare(
        `INSERT INTO findings (id, validation_id, ordem, codigo, severidade, campos_json, regra, evidencia, orientacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${validacaoId}-f${indice}`,
        validacaoId,
        indice + 1,
        s.codigos[indice],
        "pendencia",
        "[]",
        "regra",
        "evidencia",
        "orientacao",
      )
      .run();
  }
}

async function semearImportComFalhas(
  db: D1Database,
  importId: string,
  chave: string,
  iniciadoEm: string,
  quantidade: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      importId,
      chave,
      `${importId}.csv`,
      "hash-arquivo",
      "relatorios-v1",
      "hash-relatorios",
      "FALHOU",
      25,
      quantidade,
      iniciadoEm,
      iniciadoEm,
      iniciadoEm,
    )
    .run();
  for (let indice = 0; indice < quantidade; indice += 1) {
    await db
      .prepare(
        `INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, original_json, guia_id, revisao_id, motivo, dono, reservado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${importId}-l${indice}`,
        importId,
        indice + 1,
        "FALHOU",
        "linha crua",
        null,
        null,
        null,
        "motivo",
        null,
        null,
        iniciadoEm,
      )
      .run();
  }
}

/**
 * Insere um lote (`imports`) com status explícito e sem linhas, para exercitar
 * `lotesProcessando` sem criar falhas de processamento.
 */
async function semearLoteComStatus(
  db: D1Database,
  importId: string,
  chave: string,
  status: "PROCESSANDO" | "CONCLUIDO" | "PARCIAL" | "FALHOU",
  iniciadoEm: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      importId,
      chave,
      `${importId}.csv`,
      "hash-arquivo",
      "relatorios-v1",
      "hash-relatorios",
      status,
      25,
      0,
      iniciadoEm,
      iniciadoEm,
      status === "PROCESSANDO" ? null : iniciadoEm,
    )
    .run();
}

/**
 * Snapshot comparável de TODAS as métricas publicadas, exceto
 * `lotesProcessando`: prova que a presença de lote em andamento não altera
 * nenhuma outra métrica do mesmo recorte.
 */
function metricas(rel: RelatorioGuias): Record<string, unknown> {
  return {
    guias: rel.guias,
    ok: rel.ok,
    pendentes: rel.pendentes,
    falhasProcessamento: rel.falhasProcessamento,
    valorRegistradoCentavos: rel.valorRegistradoCentavos,
    totalIncompleto: rel.totalIncompleto,
    exposicaoCentavos: rel.exposicaoCentavos,
    exposicaoEstruturadaCentavos: rel.exposicaoEstruturadaCentavos,
    exposicaoTextualDuplicidadeCentavos: rel.exposicaoTextualDuplicidadeCentavos,
    possivelExcessoCentavos: rel.possivelExcessoCentavos,
    possivelExcessoIncompleto: rel.possivelExcessoIncompleto,
    valorSemPendenciaCentavos: rel.valorSemPendenciaCentavos,
    porCodigo: rel.porCodigo,
    porConvenio: rel.porConvenio,
    porUnidade: rel.porUnidade,
    referenciasTemporais: rel.referenciasTemporais,
    periodo: rel.periodo,
    referencia: rel.referencia,
  };
}

// ---------------------------------------------------------------------------
// Caso
// ---------------------------------------------------------------------------

describe("lt-estoque-unicidade-valores: unicidade, partições exclusivas e excesso", () => {
  it("conta cada guia uma vez, particiona a exposição e isola o excesso potencial (#ac-10, #ac-14)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    await semearBase(db);

    // G-001: PENDENTE estruturada, 5000 centavos, dois findings do MESMO código
    // estruturado -> guia conta uma vez em `guias`/valor, mas `ocorrencias` é 2
    // (sobreponível). Sem assinatura, não forma grupo.
    await semearGuia(db, "g-001", "G-2608-9001");
    await semearRevisao(db, {
      guiaId: "g-001",
      idGuia: "G-2608-9001",
      revisaoId: "rev-001-1",
      numero: 1,
      vigente: true,
      valorCentavos: 5000,
      convenio: "Vitalcard",
      unidade: "Sul",
      dataLancamento: "2026-08-28",
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-28",
      processadoEm: FORA_DA_JANELA,
      codigos: ["procedimento_nao_coberto", "procedimento_nao_coberto"],
    });

    // G-002: PENDENTE textual/duplicidade, 9000 centavos, no grupo válido. O
    // código textual adicional põe esta guia em DOIS baldes de `porCodigo`
    // (sobreposição entre baldes).
    await semearGuia(db, "g-002", "G-2608-9002");
    await semearRevisao(db, {
      guiaId: "g-002",
      idGuia: "G-2608-9002",
      revisaoId: "rev-002-1",
      numero: 1,
      vigente: true,
      valorCentavos: 9000,
      convenio: "Vitalcard",
      unidade: "Norte",
      dataLancamento: "2026-08-20",
      assinatura: "grupo-valido",
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-28",
      processadoEm: FORA_DA_JANELA,
      codigos: ["duplicidade_grupo_candidato", "checagem_textual_incompleta"],
    });

    // G-003: PENDENTE textual, 7000 centavos, completa o grupo válido.
    await semearGuia(db, "g-003", "G-2608-9003");
    await semearRevisao(db, {
      guiaId: "g-003",
      idGuia: "G-2608-9003",
      revisaoId: "rev-003-1",
      numero: 1,
      vigente: true,
      valorCentavos: 7000,
      convenio: "Vitalcard",
      unidade: "Sul",
      dataLancamento: "2026-08-15",
      assinatura: "grupo-valido",
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-10",
      processadoEm: FORA_DA_JANELA,
      codigos: ["duplicidade_grupo_candidato"],
    });

    // G-004: PENDENTE textual com valor válido, no grupo ILEGÍVEL.
    await semearGuia(db, "g-004", "G-2608-9004");
    await semearRevisao(db, {
      guiaId: "g-004",
      idGuia: "G-2608-9004",
      revisaoId: "rev-004-1",
      numero: 1,
      vigente: true,
      valorCentavos: 6000,
      convenio: "Plano Bem",
      unidade: "Sul",
      dataLancamento: "2026-08-15",
      assinatura: "grupo-ilegivel",
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-15",
      processadoEm: FORA_DA_JANELA,
      codigos: ["duplicidade_grupo_candidato"],
    });

    // G-005: PENDENTE com valor ILEGÍVEL (null): fora das somas e do excesso; o
    // grupo inteiro é omitido do excesso e marca incompleto.
    await semearGuia(db, "g-005", "G-2608-9005");
    await semearRevisao(db, {
      guiaId: "g-005",
      idGuia: "G-2608-9005",
      revisaoId: "rev-005-1",
      numero: 1,
      vigente: true,
      valorCentavos: null,
      convenio: "Plano Bem",
      unidade: "Sul",
      dataLancamento: "2026-08-16",
      assinatura: "grupo-ilegivel",
      decisao: "PENDENTE",
      referenciaTemporal: null,
      processadoEm: FORA_DA_JANELA,
      codigos: ["duplicidade_grupo_candidato"],
    });

    // G-006: OK com revisão OBsoleta anterior. A revisão vigente vale 3000; a
    // obsoleta vale 9999, é PENDENTE e carrega um finding. Uma implementação que
    // ignore `vigente` conta duas revisões, soma 9999 indevidamente e inclui o
    // código/referência obsoletos.
    await semearGuia(db, "g-006", "G-2608-9006");
    await semearRevisao(db, {
      guiaId: "g-006",
      idGuia: "G-2608-9006",
      revisaoId: "rev-006-1",
      numero: 1,
      vigente: false,
      valorCentavos: 9999,
      convenio: "Vitalcard",
      unidade: "Centro",
      dataLancamento: "2026-07-01",
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: "2026-07-01",
      processadoEm: FORA_DA_JANELA,
      codigos: ["procedimento_nao_coberto"],
    });
    await semearRevisao(db, {
      guiaId: "g-006",
      idGuia: "G-2608-9006",
      revisaoId: "rev-006-2",
      numero: 2,
      vigente: true,
      valorCentavos: 3000,
      convenio: "Vitalcard",
      unidade: "Centro",
      dataLancamento: "2026-08-30",
      assinatura: null,
      decisao: "OK",
      referenciaTemporal: "2026-09-01",
      processadoEm: FORA_DA_JANELA,
      codigos: [],
    });

    // Linhas FALHOU: 2 de um lote e 1 de outro. O estoque conta TODAS (3).
    await semearImportComFalhas(db, "imp-falha-a", "K-falha-a", "2026-08-15T08:00:00.000Z", 2);
    await semearImportComFalhas(db, "imp-falha-b", "K-falha-b", "2026-08-25T08:00:00.000Z", 1);

    const rel = await api.relatorioEstoque(db, { agora: AGORA, referencia: "REF-ESTOQUE" });

    // Guias/pendência: a revisão obsoleta não conta; a guia de dois findings
    // conta uma única vez.
    expect(rel.guias).toBe(6);
    expect(rel.ok).toBe(1);
    expect(rel.pendentes).toBe(5);
    expect(rel.valorRegistradoCentavos).toBe(30000);
    expect(rel.totalIncompleto).toBe(true);
    expect(rel.valorSemPendenciaCentavos).toBe(3000);

    // Partições exclusivas: 5000 estruturada + (9000 + 7000 + 6000) textual
    // = 27000; o valor ilegível fica fora.
    expect(rel.exposicaoEstruturadaCentavos).toBe(5000);
    expect(rel.exposicaoTextualDuplicidadeCentavos).toBe(22000);
    expect(rel.exposicaoCentavos).toBe(27000);
    expect(rel.exposicaoCentavos).toBe(
      rel.exposicaoEstruturadaCentavos + rel.exposicaoTextualDuplicidadeCentavos,
    );

    // Excesso potencial: grupo válido = (9000 + 7000) − 7000 = 9000; grupo
    // ilegível excluído e sinalizado. NUNCA somado à exposição (27000).
    expect(rel.possivelExcessoCentavos).toBe(9000);
    expect(rel.possivelExcessoIncompleto).toBe(true);
    expect(rel.exposicaoCentavos).toBe(27000);

    // `porCodigo`: mesmo código 2× na mesma guia (ocorrencias > guias) e código
    // compartilhado por quatro guias; a revisão obsoleta não polui. G-002 ainda
    // aparece em dois baldes distintos (sobreposição entre baldes).
    expect(rel.porCodigo["procedimento_nao_coberto"]).toEqual({ guias: 1, ocorrencias: 2 });
    expect(rel.porCodigo["checagem_textual_incompleta"]).toEqual({ guias: 1, ocorrencias: 1 });
    expect(rel.porCodigo["duplicidade_grupo_candidato"]).toEqual({ guias: 4, ocorrencias: 4 });

    expect(rel.porConvenio).toEqual({ Vitalcard: 3, "Plano Bem": 2 });
    expect(rel.porUnidade).toEqual({ Sul: 4, Norte: 1 });

    // Referências temporais distintas e ordenadas apenas das validações vigentes
    // das revisões vigentes (2026-07-01 obsoleta fica fora).
    expect(rel.referenciasTemporais).toEqual([
      "2026-08-10",
      "2026-08-15",
      "2026-08-28",
      "2026-09-01",
    ]);

    expect(rel.periodo).toEqual({ de: null, ate: null });
    expect(rel.referencia).toBe("REF-ESTOQUE");
    expect(rel.falhasProcessamento).toBe(3);
  });

  it("preserva chaves colidentes de toString/__proto__/constructor em porCodigo, porConvenio e porUnidade (#ac-10)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    await semearBase(db);

    // G-8801: `convenio`/`unidade`/código de finding nas chaves herdadas mais
    // problemáticas. Uma contagem indexada diretamente em `{}` perde o valor
    // (`__proto__` vira prototype) ou o converte em string/function.
    await semearGuia(db, "g-8801", "G-2608-8801");
    await semearRevisao(db, {
      guiaId: "g-8801",
      idGuia: "G-2608-8801",
      revisaoId: "rev-8801-1",
      numero: 1,
      vigente: true,
      valorCentavos: 5000,
      convenio: "__proto__",
      unidade: "toString",
      dataLancamento: "2026-08-10",
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-10",
      processadoEm: FORA_DA_JANELA,
      codigos: ["toString"],
    });

    // G-8802: chaves inversas, para provar as duas direções em cada mapa.
    await semearGuia(db, "g-8802", "G-2608-8802");
    await semearRevisao(db, {
      guiaId: "g-8802",
      idGuia: "G-2608-8802",
      revisaoId: "rev-8802-1",
      numero: 1,
      vigente: true,
      valorCentavos: 7000,
      convenio: "toString",
      unidade: "__proto__",
      dataLancamento: "2026-08-11",
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-11",
      processadoEm: FORA_DA_JANELA,
      codigos: ["constructor"],
    });

    const rel = await api.relatorioEstoque(db, { agora: AGORA, referencia: "REF-CHAVES" });

    expect(rel.guias).toBe(2);
    expect(rel.pendentes).toBe(2);

    // porConvenio/porUnidade: cada guia conta UMA vez em chave PRÓPRIA, com
    // valor numérico exato (nunca herdado, string ou função).
    for (const mapa of [rel.porConvenio, rel.porUnidade]) {
      expect(Object.prototype.hasOwnProperty.call(mapa, "__proto__")).toBe(true);
      expect(typeof mapa["__proto__"]).toBe("number");
      expect(mapa["__proto__"]).toBe(1);
      expect(Object.prototype.hasOwnProperty.call(mapa, "toString")).toBe(true);
      expect(typeof mapa["toString"]).toBe("number");
      expect(mapa["toString"]).toBe(1);
    }

    // porCodigo: chave própria com a contagem exata { guias, ocorrencias }.
    expect(Object.prototype.hasOwnProperty.call(rel.porCodigo, "toString")).toBe(true);
    expect(rel.porCodigo["toString"]).toEqual({ guias: 1, ocorrencias: 1 });
    expect(Object.prototype.hasOwnProperty.call(rel.porCodigo, "constructor")).toBe(true);
    expect(rel.porCodigo["constructor"]).toEqual({ guias: 1, ocorrencias: 1 });

    // A serialização JSON preserva as chaves colidentes como chaves próprias.
    const chavesConvenio = Object.keys(JSON.parse(JSON.stringify(rel.porConvenio)));
    expect(chavesConvenio).toContain("__proto__");
    expect(chavesConvenio).toContain("toString");
    const chavesCodigo = Object.keys(JSON.parse(JSON.stringify(rel.porCodigo)));
    expect(chavesCodigo).toContain("toString");
    expect(chavesCodigo).toContain("constructor");
  });

  it("expõe lotesProcessando do estoque sem alterar métricas e zera ao finalizar os lotes (#ac-16)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    await semearBase(db);

    await semearGuia(db, "g-8201", "G-2608-8201");
    await semearRevisao(db, {
      guiaId: "g-8201",
      idGuia: "G-2608-8201",
      revisaoId: "rev-8201-1",
      numero: 1,
      vigente: true,
      valorCentavos: 4200,
      convenio: "Vitalcard",
      unidade: "Sul",
      dataLancamento: "2026-08-15",
      assinatura: null,
      decisao: "OK",
      referenciaTemporal: "2026-08-15",
      processadoEm: FORA_DA_JANELA,
      codigos: [],
    });

    const antes = await api.relatorioEstoque(db, { agora: AGORA, referencia: "REF-PROC" });
    expect(antes.lotesProcessando).toBe(0);

    // Um lote PROCESSANDO iniciado dentro da janela de atividade e outro fora:
    // o estoque conta TODOS, sem corte temporal.
    await semearLoteComStatus(
      db,
      "imp-proc-dentro",
      "K-proc-dentro",
      "PROCESSANDO",
      "2026-08-15T08:00:00.000Z",
    );
    await semearLoteComStatus(db, "imp-proc-fora", "K-proc-fora", "PROCESSANDO", FORA_DA_JANELA);

    const durante = await api.relatorioEstoque(db, { agora: AGORA, referencia: "REF-PROC" });
    expect(durante.lotesProcessando).toBe(2);
    expect(metricas(durante)).toEqual(metricas(antes));

    // Finalizar os lotes em andamento zera o indicador e não mexe no resto.
    await db.prepare("UPDATE imports SET status = 'CONCLUIDO' WHERE status = 'PROCESSANDO'").run();
    const depois = await api.relatorioEstoque(db, { agora: AGORA, referencia: "REF-PROC" });
    expect(depois.lotesProcessando).toBe(0);
    expect(metricas(depois)).toEqual(metricas(antes));
  });
});
