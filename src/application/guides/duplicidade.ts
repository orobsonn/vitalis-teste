/**
 * Passe de duplicidade verificado (J14/J19/J20).
 *
 * O passe é idempotente: se o overlay persistido já é o desejado, devolve
 * `{ alteracoes: 0 }` sem gravar nada (nem o contador global). Havendo
 * divergência, reserva a versão global (`duplicidade`), regrava as validações
 * cuja composição mudou, relê e confere; repete até cinco tentativas e erra de
 * forma explícita se não convergir. Nunca reexecuta IA: o overlay deriva dos
 * findings persistidos (J11).
 */

import type { Motivo, SeveridadeMotivo } from "../../domain";
import { lerEstadoGlobal, reservarVersaoGlobal, traduzirConflitoUnicidade } from "../../storage";
import { sha256Hex } from "../../shared/sha256";
import { CODIGO_DUPLICIDADE, conteudoDaValidacao, overlayDuplicidade } from "./conferencia";
import type { OpcoesDuplicidade, ResultadoDuplicidade } from "./contratos";
import { SQL_INSERIR_FINDING, SQL_INSERIR_VALIDACAO } from "./sql";

const CHAVE_DUPLICIDADE = "duplicidade";
const MAX_TENTATIVAS = 5;

interface FindingCorrente {
  ordem: number;
  codigo: string;
  severidade: SeveridadeMotivo;
  campos: string[];
  regra: string;
  evidencia: string;
  orientacao: string;
}

interface ValidacaoCorrente {
  id: string;
  sequencia: number;
  decisao: "OK" | "PENDENTE";
  checagemTextual: string;
  referenciaTemporal: string | null;
  regrasVersao: string;
  regrasHash: string;
  rulesetId: string;
  inferenciaModelo: string | null;
  inferenciaPromptVersao: string | null;
  orientacoes: unknown;
  limitacoes: unknown;
  extracaoId: string | null;
  findings: FindingCorrente[];
}

interface RevisaoCorrente {
  id: string;
  guideId: string;
  assinatura: string | null;
  validacao: ValidacaoCorrente | null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : String(valor);
}

function textoOuNulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

async function lerEstadoCorrente(db: D1Database): Promise<RevisaoCorrente[]> {
  const revisoes = await db
    .prepare(
      "SELECT id, guide_id, assinatura_duplicidade FROM guide_revisions WHERE vigente = 1 ORDER BY guide_id ASC, id ASC",
    )
    .all<{ id: string; guide_id: string; assinatura_duplicidade: string | null }>();

  const resultado: RevisaoCorrente[] = [];
  for (const revisao of revisoes.results) {
    const validacaoLinha = await db
      .prepare(
        "SELECT id, sequencia, decisao, checagem_textual, referencia_temporal, regras_versao, " +
          "regras_hash, ruleset_id, inferencia_modelo, inferencia_prompt_versao, " +
          "orientacoes_json, limitacoes_json, extracao_id " +
          "FROM validations WHERE revision_id = ? AND vigente = 1",
      )
      .bind(revisao.id)
      .first<Record<string, unknown>>();

    let validacao: ValidacaoCorrente | null = null;
    if (validacaoLinha !== null && validacaoLinha !== undefined) {
      const findingsLinha = await db
        .prepare(
          "SELECT ordem, codigo, severidade, campos_json, regra, evidencia, orientacao " +
            "FROM findings WHERE validation_id = ? ORDER BY ordem ASC",
        )
        .bind(texto(validacaoLinha["id"]))
        .all<{
          ordem: number;
          codigo: string;
          severidade: string;
          campos_json: string;
          regra: string;
          evidencia: string;
          orientacao: string;
        }>();
      validacao = {
        id: texto(validacaoLinha["id"]),
        sequencia: Number(validacaoLinha["sequencia"]),
        decisao: texto(validacaoLinha["decisao"]) as "OK" | "PENDENTE",
        checagemTextual: texto(validacaoLinha["checagem_textual"]),
        referenciaTemporal: textoOuNulo(validacaoLinha["referencia_temporal"]),
        regrasVersao: texto(validacaoLinha["regras_versao"]),
        regrasHash: texto(validacaoLinha["regras_hash"]),
        rulesetId: texto(validacaoLinha["ruleset_id"]),
        inferenciaModelo: textoOuNulo(validacaoLinha["inferencia_modelo"]),
        inferenciaPromptVersao: textoOuNulo(validacaoLinha["inferencia_prompt_versao"]),
        orientacoes: JSON.parse(texto(validacaoLinha["orientacoes_json"])),
        limitacoes: JSON.parse(texto(validacaoLinha["limitacoes_json"])),
        extracaoId: textoOuNulo(validacaoLinha["extracao_id"]),
        findings: findingsLinha.results.map((finding) => ({
          ordem: Number(finding.ordem),
          codigo: texto(finding.codigo),
          severidade: texto(finding.severidade) as SeveridadeMotivo,
          campos: JSON.parse(texto(finding.campos_json)) as string[],
          regra: texto(finding.regra),
          evidencia: texto(finding.evidencia),
          orientacao: texto(finding.orientacao),
        })),
      };
    }

    resultado.push({
      id: texto(revisao.id),
      guideId: texto(revisao.guide_id),
      assinatura: revisao.assinatura_duplicidade ?? null,
      validacao,
    });
  }
  return resultado;
}

/** Overlay desejado por revisão: presente só em grupos com ≥ 2 revisões vigentes. */
function calcularDesejado(revisoes: readonly RevisaoCorrente[]): Map<string, Motivo | null> {
  const grupos = new Map<string, string[]>();
  for (const revisao of revisoes) {
    if (revisao.assinatura === null) {
      continue;
    }
    const membros = grupos.get(revisao.assinatura) ?? [];
    membros.push(revisao.id);
    grupos.set(revisao.assinatura, membros);
  }

  const desejado = new Map<string, Motivo | null>();
  for (const revisao of revisoes) {
    desejado.set(revisao.id, null);
  }
  for (const [assinatura, membros] of grupos) {
    if (membros.length < 2) {
      continue;
    }
    const motivo = overlayDuplicidade(assinatura, membros.length);
    for (const id of membros) {
      desejado.set(id, motivo);
    }
  }
  return desejado;
}

function overlayPersistido(validacao: ValidacaoCorrente | null): Motivo | null {
  if (validacao === null) {
    return null;
  }
  const finding = validacao.findings.find((item) => item.codigo === CODIGO_DUPLICIDADE);
  if (finding === undefined) {
    return null;
  }
  return {
    codigo: finding.codigo,
    severidade: finding.severidade,
    campos: finding.campos,
    regra: finding.regra,
    evidencia: finding.evidencia,
    orientacao: finding.orientacao,
  };
}

function mesmoOverlay(persistido: Motivo | null, desejado: Motivo | null): boolean {
  if (persistido === null || desejado === null) {
    return persistido === null && desejado === null;
  }
  return (
    persistido.evidencia === desejado.evidencia &&
    persistido.regra === desejado.regra &&
    persistido.orientacao === desejado.orientacao
  );
}

function decidirComBase(
  findings: readonly Motivo[],
  overlay: Motivo | null,
): "OK" | "PENDENTE" {
  const todos = overlay === null ? [...findings] : [...findings, overlay];
  return todos.some((motivo) => motivo.severidade === "pendencia") ? "PENDENTE" : "OK";
}

function precisaMudar(revisao: RevisaoCorrente, desejado: Motivo | null): boolean {
  const validacao = revisao.validacao;
  if (validacao === null) {
    return false;
  }
  if (!mesmoOverlay(overlayPersistido(validacao), desejado)) {
    return true;
  }
  return validacao.decisao !== decidirComBase(validacao.findings, desejado);
}

function construirStatements(
  db: D1Database,
  mudancas: readonly RevisaoCorrente[],
  desejado: Map<string, Motivo | null>,
  agora: string,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const revisao of mudancas) {
    const validacao = revisao.validacao;
    if (validacao === null) {
      continue;
    }
    const overlay = desejado.get(revisao.id) ?? null;
    const base = validacao.findings
      .filter((finding) => finding.codigo !== CODIGO_DUPLICIDADE)
      .map<Motivo>((finding) => ({
        codigo: finding.codigo,
        severidade: finding.severidade,
        campos: finding.campos,
        regra: finding.regra,
        evidencia: finding.evidencia,
        orientacao: finding.orientacao,
      }));
    const novos = overlay === null ? base : [...base, overlay];
    const decisao = decidirComBase(base, overlay);
    const sequencia = validacao.sequencia + 1;
    const conteudo = conteudoDaValidacao({
      decisao,
      checagemTextual: validacao.checagemTextual,
      referenciaTemporal: validacao.referenciaTemporal,
      regrasVersao: validacao.regrasVersao,
      regrasHash: validacao.regrasHash,
      rulesetId: validacao.rulesetId,
      inferenciaModelo: validacao.inferenciaModelo,
      inferenciaPromptVersao: validacao.inferenciaPromptVersao,
      orientacoes: validacao.orientacoes,
      limitacoes: validacao.limitacoes,
      extracaoId: validacao.extracaoId,
      processadoEm: agora,
    });
    const validacaoId = sha256Hex(`${revisao.id}\u0000${sequencia}\u0000${conteudo}`);

    statements.push(
      db
        .prepare("UPDATE validations SET vigente = 0 WHERE revision_id = ? AND vigente = 1")
        .bind(revisao.id),
    );
    statements.push(
      db
        .prepare(SQL_INSERIR_VALIDACAO)
        .bind(
          validacaoId,
          revisao.id,
          sequencia,
          1,
          decisao,
          validacao.checagemTextual,
          validacao.referenciaTemporal,
          validacao.regrasVersao,
          validacao.regrasHash,
          validacao.rulesetId,
          validacao.inferenciaModelo,
          validacao.inferenciaPromptVersao,
          JSON.stringify(validacao.orientacoes),
          JSON.stringify(validacao.limitacoes),
          validacao.extracaoId,
          agora,
        ),
    );
    novos.forEach((motivo, ordem) => {
      const findingId = sha256Hex(`${validacaoId}\u0000${ordem}\u0000${motivo.codigo}`);
      statements.push(
        db
          .prepare(SQL_INSERIR_FINDING)
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
          ),
      );
    });
  }
  return statements;
}

/**
 * Converge o overlay de duplicidade de todas as revisões vigentes.
 *
 * Retorna `{ alteracoes: 0 }` sem qualquer gravação quando já consistente; caso
 * contrário reserva a versão global, regrava as validações afetadas e verifica
 * por releitura, até cinco tentativas.
 */
export async function reavaliarDuplicidade(
  db: D1Database,
  opcoes: OpcoesDuplicidade,
): Promise<ResultadoDuplicidade> {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    const revisoes = await lerEstadoCorrente(db);
    const desejado = calcularDesejado(revisoes);
    const mudancas = revisoes.filter((revisao) => precisaMudar(revisao, desejado.get(revisao.id) ?? null));
    if (mudancas.length === 0) {
      return { alteracoes: 0 };
    }

    const versaoLida = await lerEstadoGlobal(db, CHAVE_DUPLICIDADE);
    const reserva = await reservarVersaoGlobal(db, { chave: CHAVE_DUPLICIDADE, versaoLida });
    if (!reserva.aplicado) {
      continue;
    }

    const statements = construirStatements(db, mudancas, desejado, opcoes.agora);
    try {
      await db.batch(statements);
    } catch (erro) {
      if (traduzirConflitoUnicidade(erro).tipo === "unicidade") {
        continue;
      }
      throw erro;
    }

    const apos = await lerEstadoCorrente(db);
    const desejadoApos = calcularDesejado(apos);
    const aindaDivergente = apos.some(
      (revisao) => precisaMudar(revisao, desejadoApos.get(revisao.id) ?? null),
    );
    if (!aindaDivergente) {
      return { alteracoes: mudancas.length };
    }
  }

  throw new Error(
    "passe de duplicidade não convergiu após cinco tentativas; overlay persistido diverge do desejado",
  );
}
