import type { GuiaOriginal, Motivo, ResultadoVerificacao } from "../domain";
import { mapearRevisao, mapearValidacao } from "../storage";
import type { LinhaBanco, ValidacaoPersistida } from "../storage";

interface FindingRow {
  validation_id: string; codigo: string; severidade: "pendencia" | "alerta";
  campos_json: string; regra: string; evidencia: string; orientacao: string;
}

export function mapFinding(row: FindingRow): Motivo {
  return { codigo: row.codigo, severidade: row.severidade, campos: JSON.parse(row.campos_json),
    regra: row.regra, evidencia: row.evidencia, orientacao: row.orientacao };
}

export function verificationView(v: ValidacaoPersistida, motivos: Motivo[]): ResultadoVerificacao {
  return {
    decisao: v.decisao, motivos, checagem_textual: v.checagemTextual,
    referencia_temporal: v.referenciaTemporal ?? null, regras_versao: v.regrasVersao,
    orientacoes: [...new Set([...(v.orientacoes as string[]), ...motivos.map(m => m.orientacao)])],
    limitacoes: v.limitacoes as string[],
    inferencia_textual: v.inferenciaModelo && v.inferenciaPromptVersao
      ? { modelo: v.inferenciaModelo, prompt_versao: v.inferenciaPromptVersao } : null,
  };
}

export async function findingsFor(db: D1Database, validationId: string): Promise<Motivo[]> {
  const rows = await db.prepare("SELECT * FROM findings WHERE validation_id = ? ORDER BY ordem")
    .bind(validationId).all<FindingRow>();
  return rows.results.map(mapFinding);
}

export async function listGuides(db: D1Database) {
  const [rows, findings] = await db.batch<LinhaBanco>([
    db.prepare(`SELECT g.id AS guia_id, g.id_guia, r.numero, r.entrada_original_json,
      r.entrada_normalizada_json, r.import_id, v.* FROM guides g
      JOIN guide_revisions r ON r.guide_id=g.id AND r.vigente=1
      JOIN validations v ON v.revision_id=r.id AND v.vigente=1 ORDER BY g.id_guia`),
    db.prepare(`SELECT f.* FROM findings f JOIN validations v ON v.id=f.validation_id AND v.vigente=1
      JOIN guide_revisions r ON r.id=v.revision_id AND r.vigente=1 ORDER BY f.ordem`),
  ]);
  return mapGuides(rows.results, findings.results);
}

function mapGuides(rows: LinhaBanco[], findings: LinhaBanco[]) {
  const byValidation = new Map<string, Motivo[]>();
  for (const raw of findings) {
    const row = raw as unknown as FindingRow;
    const items = byValidation.get(row.validation_id) ?? [];
    items.push(mapFinding(row)); byValidation.set(row.validation_id, items);
  }
  return rows.map((row) => {
    const validation = mapearValidacao(row);
    const motivos = byValidation.get(validation.id) ?? [];
    return {
      id: String(row.guia_id), idGuia: String(row.id_guia),
      original: JSON.parse(String(row.entrada_original_json)) as GuiaOriginal,
      normalizada: JSON.parse(String(row.entrada_normalizada_json)),
      decisao: validation.decisao, checagemTextual: validation.checagemTextual,
      motivos, revisaoNumero: Number(row.numero), processadoEm: validation.processadoEm,
      importId: row.import_id, resultado: verificationView(validation, motivos),
    };
  });
}

export async function guideDetail(db: D1Database, id: string) {
  const target = "(SELECT id FROM guides WHERE id=? OR id_guia=? ORDER BY id_guia LIMIT 1)";
  // Header, current revision and history must share one read transaction.
  const [rows, revisions, validations, findings] = await db.batch<LinhaBanco>([
    db.prepare(`SELECT g.id AS guia_id, g.id_guia, r.numero, r.entrada_original_json,
      r.entrada_normalizada_json, r.import_id, v.* FROM guides g
      JOIN guide_revisions r ON r.guide_id=g.id AND r.vigente=1
      JOIN validations v ON v.revision_id=r.id AND v.vigente=1 WHERE g.id=${target}`).bind(id, id),
    db.prepare(`SELECT * FROM guide_revisions WHERE guide_id=${target} ORDER BY numero DESC`).bind(id, id),
    db.prepare(`SELECT v.* FROM validations v JOIN guide_revisions r ON r.id=v.revision_id
      WHERE r.guide_id=${target} ORDER BY v.sequencia DESC`).bind(id, id),
    db.prepare(`SELECT f.* FROM findings f JOIN validations v ON v.id=f.validation_id
      JOIN guide_revisions r ON r.id=v.revision_id WHERE r.guide_id=${target} ORDER BY f.ordem`).bind(id, id),
  ]);
  const guia = mapGuides(rows.results, findings.results)[0];
  if (!guia) return null;
  return { guia, revisoes: revisions.results.map((row: LinhaBanco) => {
    const revisao = mapearRevisao(row);
    return { ...revisao, validacoes: validations.results.filter(v => v.revision_id === revisao.id).map(v => {
      const validacao = mapearValidacao(v);
      return { ...validacao, motivos: findings.results.filter(f => f.validation_id === validacao.id)
        .map(f => mapFinding(f as unknown as FindingRow)) };
    }) };
  }) };
}
