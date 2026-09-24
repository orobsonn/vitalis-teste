/**
 * Repositórios transacionais sobre `D1Database`.
 *
 * Toda SQL é parametrizada (`bind`); nenhum valor de entrada entra no texto da
 * query. Escritas de guia/validação e a vigência única usam `DB.batch` atômico.
 * `vigente` é validado antes de qualquer SQL: booleanos e valores fora de
 * {0, 1} são recusados sem gravar nada.
 */

import { executarBatchAtomico } from "./batch";
import type {
  EntradaReservaVersaoGlobal,
  GuiaPersistida,
  RevisaoPersistida,
  ResultadoReservaVersaoGlobal,
  ValidacaoPersistida,
  Vigente,
} from "./contratos";
import { mapearGuia, mapearRevisao, mapearValidacao, type LinhaBanco } from "./mapeadores";

const COLUNAS_REVISAO = `
  id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json,
  conteudo_hash, assinatura_duplicidade, import_id, idempotency_key, criado_em
`;

const COLUNAS_VALIDACAO = `
  id, revision_id, sequencia, vigente, decisao, checagem_textual, referencia_temporal,
  regras_versao, regras_hash, ruleset_id, inferencia_modelo, inferencia_prompt_versao,
  orientacoes_json, limitacoes_json, extracao_id, processado_em
`;

/** Recusa `vigente` fora do inteiro 0 | 1 (booleanos inclusive) antes de qualquer SQL. */
export function exigirVigente(valor: unknown): Vigente {
  if (typeof valor !== "number" || !Number.isInteger(valor) || (valor !== 0 && valor !== 1)) {
    throw new TypeError("vigente deve ser exatamente o inteiro 0 ou 1");
  }
  return valor;
}

async function lerEstadoGlobal(db: D1Database, chave: string): Promise<number | null> {
  const linha = await db
    .prepare("SELECT versao FROM estado_global WHERE chave = ?")
    .bind(chave)
    .first<{ versao: number }>();
  return linha === null || linha === undefined ? null : Number(linha.versao);
}

/**
 * CAS de `estado_global`: incrementa somente se a versão lida ainda for a
 * corrente (`WHERE chave = ? AND versao = ?`). `versaoLida === null` inicializa
 * a chave em 1 por inserção condicional, sem sobrescrever chave existente.
 */
export async function reservarVersaoGlobal(
  db: D1Database,
  entrada: EntradaReservaVersaoGlobal,
): Promise<ResultadoReservaVersaoGlobal> {
  if (entrada.versaoLida === null) {
    const insercao = await db
      .prepare(
        "INSERT INTO estado_global (chave, versao) SELECT ?, 1 WHERE NOT EXISTS (SELECT 1 FROM estado_global WHERE chave = ?)",
      )
      .bind(entrada.chave, entrada.chave)
      .run();
    if (insercao.meta.changes > 0) {
      return { aplicado: true, versao: 1 };
    }
    return { aplicado: false, versao: await lerEstadoGlobal(db, entrada.chave) };
  }

  const atualizacao = await db
    .prepare("UPDATE estado_global SET versao = versao + 1 WHERE chave = ? AND versao = ?")
    .bind(entrada.chave, entrada.versaoLida)
    .run();
  if (atualizacao.meta.changes > 0) {
    return { aplicado: true, versao: entrada.versaoLida + 1 };
  }
  return { aplicado: false, versao: await lerEstadoGlobal(db, entrada.chave) };
}

export async function inserirGuia(db: D1Database, guia: GuiaPersistida): Promise<void> {
  await db
    .prepare(
      "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(guia.id, guia.idGuia, guia.importIdInicial, guia.criadoEm, guia.atualizadoEm)
    .run();
}

export async function lerGuia(db: D1Database, idGuia: string): Promise<GuiaPersistida | null> {
  const linha = await db
    .prepare(
      "SELECT id, id_guia, import_id_inicial, criado_em, atualizado_em FROM guides WHERE id_guia = ?",
    )
    .bind(idGuia)
    .first<LinhaBanco>();
  return linha === null || linha === undefined ? null : mapearGuia(linha);
}

/**
 * Insere revisão vigente no MESMO lote atômico que desativa a vigente anterior.
 * Devolve a revisão normalizada conforme persistida.
 */
export async function inserirRevisaoVigente(
  db: D1Database,
  revisao: RevisaoPersistida,
): Promise<RevisaoPersistida> {
  const vigente = exigirVigente(revisao.vigente);

  const desativar = db
    .prepare("UPDATE guide_revisions SET vigente = 0 WHERE guide_id = ? AND vigente = 1")
    .bind(revisao.guiaId);
  const inserir = db
    .prepare(
      `INSERT INTO guide_revisions
         (id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json,
          conteudo_hash, assinatura_duplicidade, import_id, idempotency_key, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      revisao.id,
      revisao.guiaId,
      revisao.numero,
      vigente,
      JSON.stringify(revisao.entradaOriginal),
      JSON.stringify(revisao.entradaNormalizada),
      revisao.conteudoHash,
      revisao.assinaturaDuplicidade ?? null,
      revisao.importId ?? null,
      revisao.idempotencyKey ?? null,
      revisao.criadoEm,
    );

  await executarBatchAtomico(db, [desativar, inserir]);

  return {
    ...revisao,
    vigente,
    assinaturaDuplicidade: revisao.assinaturaDuplicidade ?? null,
    importId: revisao.importId ?? null,
    idempotencyKey: revisao.idempotencyKey ?? null,
  };
}

export async function lerRevisaoVigente(
  db: D1Database,
  guiaId: string,
): Promise<RevisaoPersistida | null> {
  const linha = await db
    .prepare(`SELECT ${COLUNAS_REVISAO} FROM guide_revisions WHERE guide_id = ? AND vigente = 1`)
    .bind(guiaId)
    .first<LinhaBanco>();
  return linha === null || linha === undefined ? null : mapearRevisao(linha);
}

/** Todas as revisões da guia, ordenadas por `numero` crescente (vigente e histórico). */
export async function lerHistoricoRevisoes(
  db: D1Database,
  guiaId: string,
): Promise<RevisaoPersistida[]> {
  const resultado = await db
    .prepare(`SELECT ${COLUNAS_REVISAO} FROM guide_revisions WHERE guide_id = ? ORDER BY numero ASC`)
    .bind(guiaId)
    .all<LinhaBanco>();
  return resultado.results.map(mapearRevisao);
}

/**
 * Insere validação vigente no MESMO lote atômico que desativa a vigente
 * anterior da revisão; `orientacoes`/`limitacoes` são serializadas em JSON.
 */
export async function inserirValidacaoVigente(
  db: D1Database,
  validacao: ValidacaoPersistida,
): Promise<ValidacaoPersistida> {
  const vigente = exigirVigente(validacao.vigente);

  const desativar = db
    .prepare("UPDATE validations SET vigente = 0 WHERE revision_id = ? AND vigente = 1")
    .bind(validacao.revisaoId);
  const inserir = db
    .prepare(
      `INSERT INTO validations
         (id, revision_id, sequencia, vigente, decisao, checagem_textual, referencia_temporal,
          regras_versao, regras_hash, ruleset_id, inferencia_modelo, inferencia_prompt_versao,
          orientacoes_json, limitacoes_json, extracao_id, processado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      validacao.id,
      validacao.revisaoId,
      validacao.sequencia,
      vigente,
      validacao.decisao,
      validacao.checagemTextual,
      validacao.referenciaTemporal ?? null,
      validacao.regrasVersao,
      validacao.regrasHash,
      validacao.rulesetId,
      validacao.inferenciaModelo ?? null,
      validacao.inferenciaPromptVersao ?? null,
      JSON.stringify(validacao.orientacoes),
      JSON.stringify(validacao.limitacoes),
      validacao.extracaoId ?? null,
      validacao.processadoEm,
    );

  await executarBatchAtomico(db, [desativar, inserir]);

  return {
    ...validacao,
    vigente,
    referenciaTemporal: validacao.referenciaTemporal ?? null,
    inferenciaModelo: validacao.inferenciaModelo ?? null,
    inferenciaPromptVersao: validacao.inferenciaPromptVersao ?? null,
    extracaoId: validacao.extracaoId ?? null,
  };
}

export async function lerValidacaoVigente(
  db: D1Database,
  revisaoId: string,
): Promise<ValidacaoPersistida | null> {
  const linha = await db
    .prepare(`SELECT ${COLUNAS_VALIDACAO} FROM validations WHERE revision_id = ? AND vigente = 1`)
    .bind(revisaoId)
    .first<LinhaBanco>();
  return linha === null || linha === undefined ? null : mapearValidacao(linha);
}

export { lerEstadoGlobal };
