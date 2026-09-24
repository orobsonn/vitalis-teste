/**
 * Consultas de leitura agregadas.
 *
 * O progresso é derivado de `import_lines` (fonte única de verdade), sem
 * contador denormalizado: `encontradas` é o total físico e os demais campos
 * somam `COUNT(*)` agrupado por `estado`.
 */

import type { ContagemLinhasImportacao, EstadoLinhaImportacao } from "./contratos";

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
