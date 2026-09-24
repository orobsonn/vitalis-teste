/**
 * Preparo e execução da escrita de conferência de uma guia.
 *
 * `prepararPersistenciaConferencia` resolve idempotência, histórico e criação e
 * devolve statements parametrizados (opcionalmente guardados pela posse da
 * linha). `persistirConferenciaDaGuia`/`registrarGuia` executam um único
 * `DB.batch`, refazem o preparo exatamente uma vez em colisão de unicidade e
 * passam o overlay verificado antes de devolver sucesso (J19/J20).
 */

import type { Catalogo } from "../../domain";
import { lerGuia, mapearRevisao, traduzirConflitoUnicidade } from "../../storage";
import type { RevisaoPersistida, ValidacaoPersistida } from "../../storage";
import { sha256Hex } from "../../shared/sha256";
import { assinaturaDuplicidadeDaGuia, conteudoDaValidacao, conteudoHashDaGuia } from "./conferencia";
import type {
  ConferenciaPersistivel,
  GuardaPosse,
  OpcoesPersistencia,
  ResultadoPersistencia,
  ResultadoPreparo,
} from "./contratos";
import { reavaliarDuplicidade } from "./duplicidade";
import {
  CLAUSULA_GUARDA,
  SQL_DESATIVAR_REVISAO,
  SQL_DESATIVAR_VALIDACAO,
  SQL_INSERIR_EXTRACAO,
  SQL_INSERIR_FINDING,
  SQL_INSERIR_GUIA,
  SQL_INSERIR_REVISAO,
  SQL_INSERIR_VALIDACAO,
} from "./sql";

const COLUNAS_REVISAO =
  "id, guide_id, numero, vigente, entrada_original_json, entrada_normalizada_json, " +
  "conteudo_hash, assinatura_duplicidade, import_id, idempotency_key, criado_em";

function bindsDaGuarda(guarda: GuardaPosse | undefined): unknown[] {
  return guarda ? [guarda.linhaId, guarda.token] : [];
}

function sufixoAnd(guarda: GuardaPosse | undefined): string {
  return guarda ? ` AND ${CLAUSULA_GUARDA}` : "";
}

function sufixoWhere(guarda: GuardaPosse | undefined): string {
  return guarda ? ` WHERE ${CLAUSULA_GUARDA}` : "";
}

async function lerRevisaoPorId(db: D1Database, id: string): Promise<RevisaoPersistida | null> {
  const linha = await db
    .prepare(`SELECT ${COLUNAS_REVISAO} FROM guide_revisions WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return linha === null || linha === undefined ? null : mapearRevisao(linha);
}

async function resolverRuleset(db: D1Database, regras: Catalogo): Promise<string> {
  const linha = await db
    .prepare("SELECT id FROM rulesets WHERE hash = ?")
    .bind(regras.hash)
    .first<{ id: string }>();
  if (linha === null || linha === undefined) {
    throw new Error(`ruleset ausente para o hash de catálogo ${regras.hash}`);
  }
  return String(linha.id);
}

async function proximoNumero(db: D1Database, guiaId: string): Promise<number> {
  const linha = await db
    .prepare("SELECT MAX(numero) AS maximo FROM guide_revisions WHERE guide_id = ?")
    .bind(guiaId)
    .first<{ maximo: number | null }>();
  return Number(linha?.maximo ?? 0) + 1;
}

/**
 * Resolve a extração: reutiliza o id persistido por identidade semântica ou
 * prepara a inserção determinística. Devolve o id (ou `null` sem extração).
 */
async function prepararExtracao(
  db: D1Database,
  extracao: ConferenciaPersistivel["extracao"],
  agora: string,
  guarda: GuardaPosse | undefined,
  statements: D1PreparedStatement[],
): Promise<string | null> {
  if (extracao === null) {
    return null;
  }
  const existente = await db
    .prepare(
      "SELECT id FROM semantic_extractions WHERE observacao_hash = ? AND modelo = ? AND prompt_versao = ?",
    )
    .bind(extracao.observacaoHash, extracao.modelo, extracao.promptVersao)
    .first<{ id: string }>();
  if (existente !== null && existente !== undefined) {
    return String(existente.id);
  }
  const id = sha256Hex(
    `${extracao.observacaoHash}\u0000${extracao.modelo}\u0000${extracao.promptVersao}`,
  );
  statements.push(
    db
      .prepare(SQL_INSERIR_EXTRACAO + sufixoWhere(guarda))
      .bind(
        id,
        extracao.observacaoHash,
        extracao.modelo,
        extracao.promptVersao,
        JSON.stringify(extracao.sinais),
        JSON.stringify(extracao.situacao),
        JSON.stringify(extracao.ambiguidades),
        agora,
        ...bindsDaGuarda(guarda),
      ),
  );
  return id;
}

async function construirCriacao(
  db: D1Database,
  opcoes: OpcoesPersistencia,
  conteudoHash: string,
): Promise<ResultadoPreparo> {
  // J1: a identidade `id_guia` nunca é vazia; o schema aceita string vazia por
  // `NOT NULL`, então a checagem que o storage faz em `inserirGuia` precisa ser
  // aplicada aqui antes de preparar a inserção da guia.
  if (typeof opcoes.guia.id !== "string" || opcoes.guia.id.trim() === "") {
    throw new TypeError("id_guia deve ser uma string não vazia");
  }
  const guarda = opcoes.guarda;
  const guiaPersistida = await lerGuia(db, opcoes.guia.id);
  const guiaId = guiaPersistida?.id ?? sha256Hex(`guia\u0000${opcoes.guia.id}`);
  const statements: D1PreparedStatement[] = [];

  if (!guiaPersistida) {
    statements.push(
      db
        .prepare(SQL_INSERIR_GUIA + sufixoAnd(guarda))
        .bind(
          guiaId,
          opcoes.guia.id,
          opcoes.importId ?? null,
          opcoes.agora,
          opcoes.agora,
          guiaId,
          ...bindsDaGuarda(guarda),
        ),
    );
  }

  const numero = await proximoNumero(db, guiaId);
  const assinatura = assinaturaDuplicidadeDaGuia(opcoes.guia);
  const revisaoId = sha256Hex(`${guiaId}\u0000${numero}\u0000${conteudoHash}`);

  statements.push(
    db
      .prepare(SQL_DESATIVAR_REVISAO + sufixoAnd(guarda))
      .bind(guiaId, ...bindsDaGuarda(guarda)),
  );
  statements.push(
    db
      .prepare(SQL_INSERIR_REVISAO + sufixoWhere(guarda))
      .bind(
        revisaoId,
        guiaId,
        numero,
        1,
        JSON.stringify(opcoes.guia.original),
        JSON.stringify(opcoes.guia),
        conteudoHash,
        assinatura,
        opcoes.importId ?? null,
        opcoes.idempotencyKey ?? null,
        opcoes.agora,
        ...bindsDaGuarda(guarda),
      ),
  );

  const rulesetId = await resolverRuleset(db, opcoes.regras);
  const extracaoId = await prepararExtracao(
    db,
    opcoes.conferencia.extracao,
    opcoes.agora,
    guarda,
    statements,
  );

  const resultado = opcoes.conferencia.resultado;
  const inferencia = resultado.inferencia_textual;
  const sequencia = 1;
  const conteudoValidacao = conteudoDaValidacao({
    decisao: resultado.decisao,
    checagemTextual: resultado.checagem_textual,
    referenciaTemporal: resultado.referencia_temporal ?? null,
    regrasVersao: resultado.regras_versao,
    regrasHash: opcoes.regras.hash,
    rulesetId,
    inferenciaModelo: inferencia?.modelo ?? null,
    inferenciaPromptVersao: inferencia?.prompt_versao ?? null,
    orientacoes: resultado.orientacoes,
    limitacoes: resultado.limitacoes,
    extracaoId,
    processadoEm: opcoes.agora,
  });
  const validacaoId = sha256Hex(`${revisaoId}\u0000${sequencia}\u0000${conteudoValidacao}`);

  statements.push(
    db
      .prepare(SQL_DESATIVAR_VALIDACAO + sufixoAnd(guarda))
      .bind(revisaoId, ...bindsDaGuarda(guarda)),
  );
  statements.push(
    db
      .prepare(SQL_INSERIR_VALIDACAO + sufixoWhere(guarda))
      .bind(
        validacaoId,
        revisaoId,
        sequencia,
        1,
        resultado.decisao,
        resultado.checagem_textual,
        resultado.referencia_temporal ?? null,
        resultado.regras_versao,
        opcoes.regras.hash,
        rulesetId,
        inferencia?.modelo ?? null,
        inferencia?.prompt_versao ?? null,
        JSON.stringify(resultado.orientacoes),
        JSON.stringify(resultado.limitacoes),
        extracaoId,
        opcoes.agora,
        ...bindsDaGuarda(guarda),
      ),
  );

  resultado.motivos.forEach((motivo, ordem) => {
    const findingId = sha256Hex(`${validacaoId}\u0000${ordem}\u0000${motivo.codigo}`);
    statements.push(
      db
        .prepare(SQL_INSERIR_FINDING + sufixoWhere(guarda))
        .bind(
          findingId,
          validacaoId,
          ordem,
          motivo.codigo,
          motivo.severidade,
          JSON.stringify(motivo.campos),
          motivo.regra,
          motivo.evidencia,
          motivo.orientacao,
          ...bindsDaGuarda(guarda),
        ),
    );
  });

  const revisao: RevisaoPersistida = {
    id: revisaoId,
    guiaId,
    numero,
    vigente: 1,
    entradaOriginal: opcoes.guia.original,
    entradaNormalizada: opcoes.guia,
    conteudoHash,
    assinaturaDuplicidade: assinatura,
    importId: opcoes.importId ?? null,
    idempotencyKey: opcoes.idempotencyKey ?? null,
    criadoEm: opcoes.agora,
  };
  const validacao: ValidacaoPersistida = {
    id: validacaoId,
    revisaoId,
    sequencia,
    vigente: 1,
    decisao: resultado.decisao,
    checagemTextual: resultado.checagem_textual,
    referenciaTemporal: resultado.referencia_temporal ?? null,
    regrasVersao: resultado.regras_versao,
    regrasHash: opcoes.regras.hash,
    rulesetId,
    inferenciaModelo: inferencia?.modelo ?? null,
    inferenciaPromptVersao: inferencia?.prompt_versao ?? null,
    orientacoes: resultado.orientacoes,
    limitacoes: resultado.limitacoes,
    extracaoId,
    processadoEm: opcoes.agora,
  };

  return { tipo: "criada", statements, revisao, validacao };
}

/**
 * Resolve leitura ordenada (idempotência → histórico → criação) e devolve os
 * statements preparados. Nenhuma mutação é executada aqui.
 */
export async function prepararPersistenciaConferencia(
  db: D1Database,
  opcoes: OpcoesPersistencia,
): Promise<ResultadoPreparo> {
  const conteudoHash = conteudoHashDaGuia(opcoes.guia);

  if (typeof opcoes.idempotencyKey === "string") {
    const existente = await db
      .prepare("SELECT id, conteudo_hash FROM guide_revisions WHERE idempotency_key = ?")
      .bind(opcoes.idempotencyKey)
      .first<{ id: string; conteudo_hash: string }>();
    if (existente !== null && existente !== undefined) {
      if (existente.conteudo_hash === conteudoHash) {
        return {
          tipo: "reaproveitada",
          statements: [],
          revisao: (await lerRevisaoPorId(db, String(existente.id))) ?? undefined,
        };
      }
      return { tipo: "conflito_idempotencia", statements: [] };
    }
  }

  const guiaPersistida = await lerGuia(db, opcoes.guia.id);
  if (guiaPersistida !== null) {
    const historico = await db
      .prepare(
        "SELECT id FROM guide_revisions WHERE guide_id = ? AND conteudo_hash = ? ORDER BY numero ASC LIMIT 1",
      )
      .bind(guiaPersistida.id, conteudoHash)
      .first<{ id: string }>();
    if (historico !== null && historico !== undefined) {
      return {
        tipo: "reaproveitada",
        statements: [],
        revisao: (await lerRevisaoPorId(db, String(historico.id))) ?? undefined,
      };
    }
  }

  return construirCriacao(db, opcoes, conteudoHash);
}

async function executarPreparo(
  db: D1Database,
  opcoes: OpcoesPersistencia,
): Promise<ResultadoPersistencia> {
  let preparo = await prepararPersistenciaConferencia(db, opcoes);
  if (preparo.tipo !== "criada") {
    // J19/J20: toda API escritora passa o overlay verificado antes do retorno,
    // inclusive `reaproveitada` e `conflito_idempotencia`.
    await reavaliarDuplicidade(db, { agora: opcoes.agora });
    return { tipo: preparo.tipo, revisao: preparo.revisao };
  }

  let resultado: ResultadoPersistencia;
  try {
    await db.batch(preparo.statements);
    resultado = { tipo: "criada", revisao: preparo.revisao, validacao: preparo.validacao };
  } catch (erro) {
    if (traduzirConflitoUnicidade(erro).tipo !== "unicidade") {
      throw erro;
    }
    // Reprepara exatamente uma vez: a releitura encontra a guia/revisão vencedora.
    preparo = await prepararPersistenciaConferencia(db, opcoes);
    if (preparo.tipo !== "criada") {
      // J19/J20: o passe verificado antecede qualquer retorno do escritor.
      await reavaliarDuplicidade(db, { agora: opcoes.agora });
      return { tipo: preparo.tipo, revisao: preparo.revisao };
    }
    try {
      await db.batch(preparo.statements);
    } catch (erro2) {
      if (traduzirConflitoUnicidade(erro2).tipo === "unicidade") {
        throw new Error(
          `conflito de unicidade persistente ao persistir a guia ${opcoes.guia.id}`,
        );
      }
      throw erro2;
    }
    resultado = { tipo: "criada", revisao: preparo.revisao, validacao: preparo.validacao };
  }

  await reavaliarDuplicidade(db, { agora: opcoes.agora });
  return resultado;
}

export async function persistirConferenciaDaGuia(
  db: D1Database,
  opcoes: OpcoesPersistencia,
): Promise<ResultadoPersistencia> {
  return executarPreparo(db, opcoes);
}

export async function registrarGuia(
  db: D1Database,
  opcoes: OpcoesPersistencia,
): Promise<ResultadoPersistencia> {
  return executarPreparo(db, opcoes);
}
