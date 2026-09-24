// Teste travado lt-atividade-data-lancamento (#ac-14, #ac-15):
//
//   Given duas guias com `data_lancamento` exatamente nos limites inclusivos
//   `[de, ate]`, outra fora, e linhas FALHOU em lotes iniciados dentro e fora da
//   janela,
//   When `relatorioAtividade` é lido com `processado_em` deliberadamente fora da
//   janela,
//   Then somente as duas guias de borda contribuem com seus centavos e códigos
//   exatos, `falhasProcessamento` conta apenas falhas de lotes iniciados dentro,
//   e alterar `processado_em` não muda as métricas nem a referência do intervalo.
//
// A borda civil é INCLUSIVA nas duas pontas (`[de, ate]`); `processado_em` é
// auditoria técnica e nunca filtro. O teste RODA de fato duas vezes, antes e
// depois de reescrever `processado_em`, e compara o snapshot inteiro das
// métricas — não apenas uma checagem de tipo.
//
// O barrel `src/reports/index.ts` entra por `import.meta.glob` (a SUT ainda não
// existe): a primeira asserção é de superfície, de modo que o RED é falha de
// asserção, nunca erro de coleta/import. Sem `node:fs`, sem rede, sem relógio de
// parede e sem dependência nova.
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
const DENTRO_DA_JANELA = "2026-08-15T12:00:00.000Z";
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

/** Snapshot comparável das métricas operacionais + janela/referência. */
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

describe("lt-atividade-data-lancamento: borda inclusive e processado_em como auditoria", () => {
  it("recorta por data_lancamento, conta falhas da janela e ignora processado_em (#ac-14, #ac-15)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    await semearBase(db);

    const DE = "2026-08-10";
    const ATE = "2026-08-20";

    // G-9101: exatamente no limite INFERIOR (inclusive), PENDENTE estruturada.
    await semearGuia(db, "g-9101", "G-2608-9101");
    await semearRevisao(db, {
      guiaId: "g-9101",
      idGuia: "G-2608-9101",
      revisaoId: "rev-9101-1",
      numero: 1,
      vigente: true,
      valorCentavos: 1100,
      convenio: "Vitalcard",
      unidade: "Sul",
      dataLancamento: DE,
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: DE,
      processadoEm: FORA_DA_JANELA,
      codigos: ["procedimento_nao_coberto"],
    });

    // G-9102: exatamente no limite SUPERIOR (inclusive), OK.
    await semearGuia(db, "g-9102", "G-2608-9102");
    await semearRevisao(db, {
      guiaId: "g-9102",
      idGuia: "G-2608-9102",
      revisaoId: "rev-9102-1",
      numero: 1,
      vigente: true,
      valorCentavos: 2200,
      convenio: "Vitalcard",
      unidade: "Sul",
      dataLancamento: ATE,
      assinatura: null,
      decisao: "OK",
      referenciaTemporal: ATE,
      processadoEm: FORA_DA_JANELA,
      codigos: [],
    });

    // G-9103: um dia DEPOIS do limite superior; fora do recorte. Um
    // implementação que recorte por `processado_em` (ou que ignore a janela)
    // incluiria esta guia.
    await semearGuia(db, "g-9103", "G-2608-9103");
    await semearRevisao(db, {
      guiaId: "g-9103",
      idGuia: "G-2608-9103",
      revisaoId: "rev-9103-1",
      numero: 1,
      vigente: true,
      valorCentavos: 9900,
      convenio: "Plano Bem",
      unidade: "Norte",
      dataLancamento: "2026-08-21",
      assinatura: null,
      decisao: "PENDENTE",
      referenciaTemporal: "2026-08-25",
      processadoEm: FORA_DA_JANELA,
      codigos: ["checagem_textual_incompleta"],
    });

    // Lotes: 2 falhas de um lote iniciado DENTRO da janela e 1 de um lote
    // iniciado FORA. A atividade conta apenas as 2 primeiras.
    await semearImportComFalhas(db, "imp-dentro", "K-dentro", "2026-08-15T08:00:00.000Z", 2);
    await semearImportComFalhas(db, "imp-fora", "K-fora", "2026-08-25T08:00:00.000Z", 1);

    const antes = await api.relatorioAtividade(db, {
      de: DE,
      ate: ATE,
      agora: AGORA,
      referencia: "REF-ATIVIDADE",
    });

    // Só as duas guias de borda: centavos e código exatos; a de fora não entra.
    expect(antes.guias).toBe(2);
    expect(antes.ok).toBe(1);
    expect(antes.pendentes).toBe(1);
    expect(antes.valorRegistradoCentavos).toBe(3300);
    expect(antes.valorSemPendenciaCentavos).toBe(2200);
    expect(antes.totalIncompleto).toBe(false);
    expect(antes.exposicaoCentavos).toBe(1100);
    expect(antes.exposicaoEstruturadaCentavos).toBe(1100);
    expect(antes.exposicaoTextualDuplicidadeCentavos).toBe(0);
    expect(antes.possivelExcessoCentavos).toBe(0);
    expect(antes.possivelExcessoIncompleto).toBe(false);
    expect(antes.porCodigo["procedimento_nao_coberto"]).toEqual({ guias: 1, ocorrencias: 1 });
    expect(antes.porCodigo["checagem_textual_incompleta"]).toBeUndefined();
    expect(antes.porConvenio).toEqual({ Vitalcard: 1 });
    expect(antes.porUnidade).toEqual({ Sul: 1 });
    expect(antes.referenciasTemporais).toEqual([DE, ATE]);
    expect(antes.falhasProcessamento).toBe(2);

    // A janela é exatamente a informada, ainda que `processado_em` esteja fora.
    expect(antes.periodo).toEqual({ de: DE, ate: ATE });
    expect(antes.referencia).toBe("REF-ATIVIDADE");

    // Reescreve `processado_em` de todas as validações para DENTRO da janela e
    // reexecuta: nenhuma métrica nem a referência do intervalo mudam, provando
    // que `processado_em` é auditoria e nunca filtro operacional.
    await db.prepare("UPDATE validations SET processado_em = ?").bind(DENTRO_DA_JANELA).run();

    const depois = await api.relatorioAtividade(db, {
      de: DE,
      ate: ATE,
      agora: AGORA,
      referencia: "REF-ATIVIDADE",
    });
    expect(metricas(depois)).toEqual(metricas(antes));
    expect(depois.guias).toBe(2);
    expect(depois.falhasProcessamento).toBe(2);
    expect(depois.periodo).toEqual({ de: DE, ate: ATE });
    expect(depois.referencia).toBe("REF-ATIVIDADE");
  });
});
