/**
 * Consultas de leitura agregadas.
 *
 * O progresso é derivado de `import_lines` (fonte única de verdade), sem
 * contador denormalizado: `encontradas` é o total físico e os demais campos
 * somam `COUNT(*)` agrupado por `estado`.
 */

import type {
  ContagemLinhasImportacao,
  EstadoLinhaImportacao,
  ImportacaoPersistida,
  LinhaImportacao,
} from "./contratos";
import { mapearImportacao, mapearLinhaImportacao, type LinhaBanco } from "./mapeadores";

const COLUNAS_IMPORTACAO = `
  id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash,
  status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em
`;

const COLUNAS_LINHA = `
  id, import_id, numero_linha, estado, linha_original, original_json,
  guia_id, revisao_id, motivo, dono, reservado_em, atualizado_em
`;

/** Metadados tipados do lote (`imports`) ou `null` quando o id não existe. */
export async function lerImportacao(
  db: D1Database,
  id: string,
): Promise<ImportacaoPersistida | null> {
  const linha = await db
    .prepare(`SELECT ${COLUNAS_IMPORTACAO} FROM imports WHERE id = ?`)
    .bind(id)
    .first<LinhaBanco>();
  return linha === null || linha === undefined ? null : mapearImportacao(linha);
}

/**
 * Todas as linhas do lote (`import_lines`) em ordem física crescente, com
 * estado e posse — sem escrita nem transição, apenas leitura tipada.
 */
export async function lerLinhasDoLote(
  db: D1Database,
  importId: string,
): Promise<LinhaImportacao[]> {
  const resultado = await db
    .prepare(`SELECT ${COLUNAS_LINHA} FROM import_lines WHERE import_id = ? ORDER BY numero_linha ASC`)
    .bind(importId)
    .all<LinhaBanco>();
  return resultado.results.map(mapearLinhaImportacao);
}

export async function contarLinhasPorEstado(
  db: D1Database,
  importId: string,
): Promise<ContagemLinhasImportacao> {
  const resultado = await db
    .prepare(
      "SELECT estado, COUNT(*) AS total FROM import_lines WHERE import_id = ? GROUP BY estado",
    )
    .bind(importId)
    .all<{ estado: string; total: number }>();

  const contagem: ContagemLinhasImportacao = {
    encontradas: 0,
    pendentes: 0,
    emAndamento: 0,
    processadas: 0,
    reaproveitadas: 0,
    comFalha: 0,
  };

  for (const linha of resultado.results) {
    const total = Number(linha.total);
    contagem.encontradas += total;
    switch (linha.estado as EstadoLinhaImportacao) {
      case "PENDENTE":
        contagem.pendentes += total;
        break;
      case "EM_ANDAMENTO":
        contagem.emAndamento += total;
        break;
      case "PROCESSADO":
        contagem.processadas += total;
        break;
      case "REAPROVEITADO":
        contagem.reaproveitadas += total;
        break;
      case "FALHOU":
        contagem.comFalha += total;
        break;
      default:
        break;
    }
  }

  return contagem;
}
