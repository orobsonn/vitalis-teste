import { normalizarGuia, type GuiaOriginal } from "../../domain";
import { allowRateLimit } from "../../auth/limits";
import { MODELO_OBSERVACAO } from "../../semantic/workers-ai";
import { versaoEfetivaDoPrompt } from "../../semantic/prompt";
import { sha256Hex } from "../../shared/sha256";
import { textoCanonico } from "../../shared/json-canonico";
import { catalogo, createConference } from "../runtime";
import { PublicError } from "../errors";
import { withOperationalLock } from "../lock";
import { guideDetail } from "../views";
import { conferirGuiaAdHoc } from "./consulta-ad-hoc";
import { conteudoDaValidacao } from "./conferencia";
import { SQL_INSERIR_EXTRACAO, SQL_INSERIR_FINDING, SQL_INSERIR_VALIDACAO } from "./sql";

interface Snapshot {
  revision_id: string; guide_id: string; entrada_original_json: string;
  validation_id: string; sequencia: number; checagem_textual: string;
  referencia_temporal: string | null; regras_hash: string; ruleset_id: string;
  inferencia_modelo: string | null; inferencia_prompt_versao: string | null;
}

/** Rechecks only the current persisted content; never creates/restores a revision. */
export async function reconferirGuia(env: Env, id: string) {
  return withOperationalLock(env.DB, async () => {
    const current = await env.DB.prepare(`SELECT r.id AS revision_id, r.guide_id, r.entrada_original_json,
      v.id AS validation_id, v.sequencia, v.checagem_textual, v.referencia_temporal,
      v.regras_hash, v.ruleset_id, v.inferencia_modelo, v.inferencia_prompt_versao
      FROM guides g JOIN guide_revisions r ON r.guide_id=g.id AND r.vigente=1
      JOIN validations v ON v.revision_id=r.id AND v.vigente=1 WHERE g.id=? OR g.id_guia=?`)
      .bind(id, id).first<Snapshot>();
    if (!current) throw new PublicError(404, "Guia não encontrada.");
    const original = JSON.parse(current.entrada_original_json) as GuiaOriginal;
    const response = async (recuperada: boolean, jaConcluida: boolean) => {
      const detail = await guideDetail(env.DB, current.guide_id);
      if (!detail) throw new PublicError(409, "A revisão mudou durante a conferência. Atualize a página.");
      return { recuperada, jaConcluida, guia: detail.guia };
    };
    const currentModel = current.inferencia_modelo === MODELO_OBSERVACAO;
    const currentPrompt = current.inferencia_prompt_versao === versaoEfetivaDoPrompt();
    if (!original.observacao_recepcao.trim() || (current.checagem_textual === "completa" && currentModel && currentPrompt)) {
      return response(false, true);
    }
    if (current.regras_hash !== catalogo.hash) {
      throw new PublicError(409, "As regras desta conferência mudaram. Revise a guia antes de conferir novamente.");
    }
    const quota = await allowRateLimit(env.DB, `reconferir:${current.guide_id}`, 1, 30);
    if (!quota.allowed) throw new PublicError(429, "Aguarde 30 segundos antes de repetir esta checagem.");
    const guia = normalizarGuia({ original, numero: 1, linhaOriginal: "" });
    const conferencia = await createConference(env)(guia, current.referencia_temporal ?? undefined);
    // Failed recovery does not replace the known result or fill the history with retries.
    if (conferencia.resultado.checagem_textual !== "completa") return response(false, false);
    const extracao = conferencia.extracao;
    if (!extracao) throw new PublicError(503, "A checagem não produziu uma extração válida. Tente novamente.");
    const agora = new Date().toISOString();
    const overlay = await conferirGuiaAdHoc(env.DB, { guia, conferencia, regras: catalogo, agora });
    const resultado = { ...conferencia.resultado, ...overlay,
      orientacoes: [...new Set([...conferencia.resultado.orientacoes, ...overlay.motivos.map(m => m.orientacao)])] };

    // This CAS starts a changes() chain. A stale revision/validation makes every
    // statement a no-op, including extraction/findings; any SQL error rolls back all.
    const statements = [env.DB.prepare(`UPDATE validations SET vigente=0 WHERE id=? AND revision_id=? AND vigente=1
      AND EXISTS (SELECT 1 FROM guide_revisions WHERE id=? AND vigente=1)`)
      .bind(current.validation_id, current.revision_id, current.revision_id)];
    const existing = await env.DB.prepare("SELECT id,sinais_json,situacao_json,ambiguidades_json FROM semantic_extractions WHERE observacao_hash=? AND modelo=? AND prompt_versao=?")
      .bind(extracao.observacaoHash, extracao.modelo, extracao.promptVersao)
      .first<{ id: string; sinais_json: string; situacao_json: string; ambiguidades_json: string }>();
    if (existing && textoCanonico([JSON.parse(existing.sinais_json), JSON.parse(existing.situacao_json), JSON.parse(existing.ambiguidades_json)]) !==
      textoCanonico([extracao.sinais, extracao.situacao, extracao.ambiguidades])) {
      throw new PublicError(503, "A interpretação retornou informação divergente da extração registrada. O resultado anterior foi preservado.");
    }
    const extractionId = existing?.id ?? sha256Hex(JSON.stringify([extracao.observacaoHash, extracao.modelo, extracao.promptVersao]));
    if (!existing) {
      statements.push(env.DB.prepare(SQL_INSERIR_EXTRACAO + " WHERE changes()=1").bind(extractionId,
        extracao.observacaoHash, extracao.modelo, extracao.promptVersao, JSON.stringify(extracao.sinais),
        JSON.stringify(extracao.situacao), JSON.stringify(extracao.ambiguidades), agora));
    }
    const sequence = current.sequencia + 1;
    const inference = resultado.inferencia_textual;
    const content = conteudoDaValidacao({ decisao: resultado.decisao, checagemTextual: resultado.checagem_textual,
      referenciaTemporal: current.referencia_temporal, regrasVersao: resultado.regras_versao,
      regrasHash: current.regras_hash, rulesetId: current.ruleset_id, inferenciaModelo: inference?.modelo ?? null,
      inferenciaPromptVersao: inference?.prompt_versao ?? null, orientacoes: resultado.orientacoes,
      limitacoes: resultado.limitacoes, extracaoId: extractionId, processadoEm: agora });
    const validationId = sha256Hex(JSON.stringify([current.revision_id, sequence, content]));
    statements.push(env.DB.prepare(SQL_INSERIR_VALIDACAO + " WHERE changes()=1").bind(validationId,
      current.revision_id, sequence, 1, resultado.decisao, resultado.checagem_textual,
      current.referencia_temporal, resultado.regras_versao, current.regras_hash, current.ruleset_id,
      inference?.modelo ?? null, inference?.prompt_versao ?? null, JSON.stringify(resultado.orientacoes),
      JSON.stringify(resultado.limitacoes), extractionId, agora));
    for (const [ordem, motivo] of resultado.motivos.entries()) {
      statements.push(env.DB.prepare(SQL_INSERIR_FINDING + " WHERE changes()=1").bind(
        sha256Hex(JSON.stringify([validationId, ordem, motivo.codigo])), validationId, ordem,
        motivo.codigo, motivo.severidade, JSON.stringify(motivo.campos), motivo.regra, motivo.evidencia, motivo.orientacao));
    }
    const committed = await env.DB.batch(statements);
    if (committed[0].meta.changes !== 1) throw new PublicError(409, "A revisão mudou durante a conferência. Atualize a página.");
    return response(true, false);
  });
}
