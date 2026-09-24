/**
 * Contratos tipados dos relatórios de guias.
 *
 * Estoque e atividade compartilham exatamente a mesma forma de saída: os dois
 * são recortes da mesma classificação monetária (revisões vigentes com validação
 * vigente), diferindo apenas no filtro temporal. Nenhum campo esconde uma soma
 * ambígua: exposição é a soma de duas partições exclusivas e o excesso potencial
 * é explicitamente separado e não aditivo.
 *
 * Nada aqui lê relógio de parede: `agora` é aceito por compatibilidade de
 * chamada (auditoria do chamador) e não participa de métrica alguma.
 */

/** Opções do relatório de estoque atual (sem recorte temporal). */
export interface OpcoesRelatorioEstoque {
  agora?: string;
  referencia?: string;
}

/** Opções do relatório de atividade por `data_lancamento`, `[de, ate]` incluso. */
export interface OpcoesRelatorioAtividade {
  de: string;
  ate: string;
  agora?: string;
  referencia?: string;
}

/** Ocorrências sobreponíveis de um código: guias distintas e total de findings. */
export interface ContagemCodigo {
  guias: number;
  ocorrencias: number;
}

/** Forma pública comum do relatório de guias (estoque e atividade). */
export interface RelatorioGuias {
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
