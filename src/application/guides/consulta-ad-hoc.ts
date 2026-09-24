/**
 * Consulta ad hoc de uma guia: estritamente somente leitura (#ac-15).
 *
 * Devolve a decisão e os motivos da conferência fornecida e, quando a
 * assinatura da guia entra num grupo vigente existente (contando a própria
 * guia), acrescenta o overlay de duplicidade e recalcula a decisão. Nenhuma
 * linha é criada, alterada ou removida e nenhum contador global é tocado.
 */

import type { Motivo } from "../../domain";
import { assinaturaDuplicidadeDaGuia, overlayDuplicidade } from "./conferencia";
import type { OpcoesAdHoc, ResultadoAdHoc } from "./contratos";

export async function conferirGuiaAdHoc(
  db: D1Database,
  opcoes: OpcoesAdHoc,
): Promise<ResultadoAdHoc> {
  const motivos: Motivo[] = [...opcoes.conferencia.resultado.motivos];
  const assinatura = assinaturaDuplicidadeDaGuia(opcoes.guia);

  if (assinatura !== null) {
    const membros = await db
      .prepare(
        "SELECT g.id_guia AS id_guia FROM guide_revisions r " +
          "JOIN guides g ON g.id = r.guide_id " +
          "WHERE r.vigente = 1 AND r.assinatura_duplicidade = ?",
      )
      .bind(assinatura)
      .all<{ id_guia: string }>();
    const jaIncluida = membros.results.some((membro) => membro.id_guia === opcoes.guia.id);
    const cardinalidade = membros.results.length + (jaIncluida ? 0 : 1);
    if (cardinalidade >= 2) {
      motivos.push(overlayDuplicidade(assinatura, cardinalidade));
    }
  }

  const decisao = motivos.some((motivo) => motivo.severidade === "pendencia")
    ? "PENDENTE"
    : "OK";
  return { decisao, motivos };
}
