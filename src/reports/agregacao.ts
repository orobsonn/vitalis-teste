/**
 * Agregação somente leitura compartilhada pelos relatórios de estoque e
 * atividade.
 *
 * Fonte de verdade: revisões vigentes (`guide_revisions.vigente = 1`) com a
 * respectiva validação vigente (`validations.vigente = 1`). Cada guia conta uma
 * única vez, ainda que carregue vários findings, e revisões obsoletas nunca
 * entram nas métricas. Tudo é derivado do conteúdo persistido; `id_guia` é
 * identidade de armazenamento e jamais seleciona decisão.
 *
 * Partições exclusivas da exposição: uma guia PENDENTE com ao menos uma
 * pendência de código fora do conjunto textual/duplicidade conta em
 * `exposicaoEstruturadaCentavos`; as demais pendentes contam em
 * `exposicaoTextualDuplicidadeCentavos`. O excesso potencial de duplicidade é
 * calculado por assinatura e NUNCA é somado à exposição.
 *
 * Somas em centavos: cada parcela já é um inteiro seguro, mas o acumulado é
 * mantido em aritmética inteira exata (`bigint`). A conversão para `number` só
 * acontece no limite publicado e satura em `Number.MAX_SAFE_INTEGER` apenas
 * quando o valor FINAL não cabe em um inteiro seguro. Nenhum acumulado
 * intermediário é saturado antes de ser subtraído ou comparado, de modo que um
 * excesso exato representável nunca é distorcido e o total permanece
 * independente da ordem de entrada.
 *
 * Toda SQL usa `bind` para valores de entrada; nenhum valor é concatenado no
 * texto da query. O recorte temporal é aplicado em memória sobre a data civil,
 * de forma que `processado_em` (auditoria) nunca delimita métrica operacional.
 */

import { dataParaIso, parseDataCivil, type DataCivil } from "../domain";
import type { ContagemCodigo, RelatorioGuias } from "./contratos";

/**
 * Códigos que caracterizam pendência textual/duplicidade. Qualquer outro código
 * de pendência é estruturado. O conjunto é literal e fechado por contrato.
 */
export const CODIGOS_TEXTUAIS_DUPLICIDADE: ReadonlySet<string> = new Set([
  "autorizacao_nova_nao_cadastrada",
  "autorizacao_verbal_sem_numero",
  "modalidade_particular_contraditoria",
  "procedimento_realizado_divergente",
  "conferencia_humana_especifica",
  "checagem_textual_incompleta",
  "duplicidade_grupo_candidato",
]);

/** Recorte temporal do relatório: `null` nas duas pontas desliga o filtro. */
export interface RecorteTemporal {
  de: string | null;
  ate: string | null;
}

/** Projeção de uma revisão vigente com a validação vigente dentro do recorte. */
export interface LinhaRecorte {
  validacaoId: string;
  decisao: "OK" | "PENDENTE";
  referenciaTemporal: string | null;
  assinaturaDuplicidade: string | null;
  valorCentavos: number | null;
  convenio: string;
  unidade: string;
}

/** Finding de uma validação vigente, com a severidade que classifica a guia. */
export interface FindingRecorte {
  validacaoId: string;
  codigo: string;
  severidade: "pendencia" | "alerta";
}

interface NormalizadaProjetada {
  valorCentavos: number | null;
  convenio: string;
  unidade: string;
  dataLancamento: DataCivil | null;
}

interface GrupoExcesso {
  membros: number;
  soma: bigint;
  menor: number | null;
  ilegivel: boolean;
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function lerTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/** Inteiro seguro ou `null` (ilegível nunca vira zero). */
function lerValorCentavos(valor: unknown): number | null {
  return typeof valor === "number" && Number.isSafeInteger(valor) ? valor : null;
}

/** Aceita `{ano,mes,dia}` persistido e, defensivamente, texto ISO/brasileiro. */
function lerDataCivil(valor: unknown): DataCivil | null {
  if (typeof valor === "string") {
    return parseDataCivil(valor);
  }
  const objeto = comoObjeto(valor);
  if (objeto === null) {
    return null;
  }
  const ano = objeto.ano;
  const mes = objeto.mes;
  const dia = objeto.dia;
  if (
    typeof ano === "number" &&
    Number.isInteger(ano) &&
    typeof mes === "number" &&
    Number.isInteger(mes) &&
    typeof dia === "number" &&
    Number.isInteger(dia)
  ) {
    return { ano, mes, dia };
  }
  return null;
}

/**
 * Projeta a entrada normalizada de forma tolerante. A entrada real é uma
 * `GuiaNormalizada` serializada; o fallback para `original` cobre variações de
 * persistência sem inventar dados.
 */
function projetarNormalizada(textoJson: string): NormalizadaProjetada {
  let bruto: unknown;
  try {
    bruto = JSON.parse(textoJson);
  } catch {
    return { valorCentavos: null, convenio: "", unidade: "", dataLancamento: null };
  }
  const objeto = comoObjeto(bruto);
  if (objeto === null) {
    return { valorCentavos: null, convenio: "", unidade: "", dataLancamento: null };
  }
  const original = comoObjeto(objeto.original);
  const dataLancamento =
    lerDataCivil(objeto.dataLancamento) ??
    (original === null ? null : lerDataCivil(original.data_lancamento));
  const convenio = lerTexto(objeto.convenio);
  const unidade = lerTexto(objeto.unidade);
  return {
    valorCentavos: lerValorCentavos(objeto.valorCentavos),
    convenio: convenio === "" && original !== null ? lerTexto(original.convenio) : convenio,
    unidade: unidade === "" && original !== null ? lerTexto(original.unidade) : unidade,
    dataLancamento,
  };
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function exigirId(valor: unknown): string {
  return typeof valor === "string" ? valor : String(valor);
}

/** Limites seguros da conversão de um acumulado exato em centavos. */
const MAX_CENTAVOS = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_CENTAVOS = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Publica um acumulado exato de centavos como `number`. A saturação ocorre
 * apenas quando o valor FINAL não cabe em um inteiro seguro; acumulados
 * intermediários permanecem exatos em `bigint` e nunca são saturados antes de
 * uma subtração ou comparação.
 */
function publicarCentavos(exato: bigint): number {
  if (exato > MAX_CENTAVOS) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (exato < MIN_CENTAVOS) {
    return Number.MIN_SAFE_INTEGER;
  }
  return Number(exato);
}

/**
 * Soma verificada de dois centavos já publicados: satura em
 * `Number.MAX_SAFE_INTEGER` em vez de publicar um total não seguro/arredondado.
 * Utilitário público para uma soma pontual; as agregações internas usam
 * `bigint` para não saturar valores intermediários.
 */
export function somarCentavos(acumulado: number, parcela: number): number {
  const total = acumulado + parcela;
  return Number.isSafeInteger(total) ? total : Number.MAX_SAFE_INTEGER;
}

/**
 * Lê as revisões vigentes com validação vigente e aplica o recorte temporal por
 * `data_lancamento` civil, inclusivo nas duas pontas. Sem filtro (`de`/`ate`
 * nulos), devolve o estoque inteiro.
 */
export async function carregarLinhas(
  db: D1Database,
  recorte: RecorteTemporal,
): Promise<LinhaRecorte[]> {
  const resultado = await db
    .prepare(
      `SELECT r.entrada_normalizada_json AS normalizada,
              r.assinatura_duplicidade AS assinatura,
              v.id AS validacao_id,
              v.decisao AS decisao,
              v.referencia_temporal AS referencia_temporal
         FROM guide_revisions r
         JOIN validations v ON v.revision_id = r.id AND v.vigente = 1
        WHERE r.vigente = 1`,
    )
    .all<Record<string, unknown>>();

  const linhas: LinhaRecorte[] = [];
  for (const bruta of resultado.results) {
    const projetada = projetarNormalizada(lerTexto(bruta.normalizada));
    if (recorte.de !== null && recorte.ate !== null) {
      if (projetada.dataLancamento === null) {
        continue;
      }
      const iso = dataParaIso(projetada.dataLancamento);
      if (iso < recorte.de || iso > recorte.ate) {
        continue;
      }
    }
    linhas.push({
      validacaoId: exigirId(bruta.validacao_id),
      decisao: bruta.decisao === "PENDENTE" ? "PENDENTE" : "OK",
      referenciaTemporal: textoOpcional(bruta.referencia_temporal),
      assinaturaDuplicidade: textoOpcional(bruta.assinatura),
      valorCentavos: projetada.valorCentavos,
      convenio: projetada.convenio,
      unidade: projetada.unidade,
    });
  }
  return linhas;
}

/** Findings das validações vigentes de revisões vigentes (a serem recortados). */
export async function carregarFindings(db: D1Database): Promise<FindingRecorte[]> {
  const resultado = await db
    .prepare(
      `SELECT f.validation_id AS validacao_id, f.codigo AS codigo, f.severidade AS severidade
         FROM findings f
         JOIN validations v ON v.id = f.validation_id
         JOIN guide_revisions r ON r.id = v.revision_id
        WHERE r.vigente = 1 AND v.vigente = 1`,
    )
    .all<Record<string, unknown>>();

  return resultado.results.map((bruta) => ({
    validacaoId: exigirId(bruta.validacao_id),
    codigo: exigirId(bruta.codigo),
    severidade: bruta.severidade === "alerta" ? "alerta" : "pendencia",
  }));
}

/**
 * Monta o relatório a partir das linhas e findings já recortados. Função pura:
 * não lê banco nem relógio e não depende de ordem de entrada.
 */
export function montarRelatorio(
  linhas: readonly LinhaRecorte[],
  findings: readonly FindingRecorte[],
  falhasProcessamento: number,
  periodo: { de: string | null; ate: string | null },
  referencia: string | null,
): RelatorioGuias {
  const validacoesDoRecorte = new Set(linhas.map((linha) => linha.validacaoId));

  const pendenciasPorValidacao = new Map<string, Set<string>>();
  const porCodigo: Record<string, ContagemCodigo> = {};
  const guiasPorCodigo = new Map<string, Set<string>>();

  for (const finding of findings) {
    if (!validacoesDoRecorte.has(finding.validacaoId)) {
      continue;
    }
    const contagem = porCodigo[finding.codigo] ?? { guias: 0, ocorrencias: 0 };
    contagem.ocorrencias += 1;
    porCodigo[finding.codigo] = contagem;
    let conjunto = guiasPorCodigo.get(finding.codigo);
    if (conjunto === undefined) {
      conjunto = new Set<string>();
      guiasPorCodigo.set(finding.codigo, conjunto);
    }
    conjunto.add(finding.validacaoId);
    if (finding.severidade === "pendencia") {
      let codigos = pendenciasPorValidacao.get(finding.validacaoId);
      if (codigos === undefined) {
        codigos = new Set<string>();
        pendenciasPorValidacao.set(finding.validacaoId, codigos);
      }
      codigos.add(finding.codigo);
    }
  }
  for (const [codigo, conjunto] of guiasPorCodigo) {
    const contagem = porCodigo[codigo];
    if (contagem !== undefined) {
      contagem.guias = conjunto.size;
    }
  }

  let guias = 0;
  let ok = 0;
  let pendentes = 0;
  let valorRegistradoCentavos = 0n;
  let valorSemPendenciaCentavos = 0n;
  let totalIncompleto = false;
  let exposicaoEstruturadaCentavos = 0n;
  let exposicaoTextualDuplicidadeCentavos = 0n;
  const porConvenio: Record<string, number> = {};
  const porUnidade: Record<string, number> = {};
  const referenciasTemporais = new Set<string>();
  const grupos = new Map<string, GrupoExcesso>();

  for (const linha of linhas) {
    guias += 1;
    if (linha.referenciaTemporal !== null) {
      referenciasTemporais.add(linha.referenciaTemporal);
    }

    if (linha.assinaturaDuplicidade !== null) {
      let grupo = grupos.get(linha.assinaturaDuplicidade);
      if (grupo === undefined) {
        grupo = { membros: 0, soma: 0n, menor: null, ilegivel: false };
        grupos.set(linha.assinaturaDuplicidade, grupo);
      }
      grupo.membros += 1;
      if (linha.valorCentavos === null) {
        grupo.ilegivel = true;
      } else {
        grupo.soma += BigInt(linha.valorCentavos);
        if (grupo.menor === null || linha.valorCentavos < grupo.menor) {
          grupo.menor = linha.valorCentavos;
        }
      }
    }

    if (linha.valorCentavos === null) {
      totalIncompleto = true;
    } else {
      valorRegistradoCentavos += BigInt(linha.valorCentavos);
    }

    if (linha.decisao === "OK") {
      ok += 1;
      if (linha.valorCentavos !== null) {
        valorSemPendenciaCentavos += BigInt(linha.valorCentavos);
      }
      continue;
    }

    pendentes += 1;
    porConvenio[linha.convenio] = (porConvenio[linha.convenio] ?? 0) + 1;
    porUnidade[linha.unidade] = (porUnidade[linha.unidade] ?? 0) + 1;

    if (linha.valorCentavos !== null) {
      const codigos = pendenciasPorValidacao.get(linha.validacaoId);
      const estruturada =
        codigos !== undefined && [...codigos].some((codigo) => !CODIGOS_TEXTUAIS_DUPLICIDADE.has(codigo));
      if (estruturada) {
        exposicaoEstruturadaCentavos += BigInt(linha.valorCentavos);
      } else {
        exposicaoTextualDuplicidadeCentavos += BigInt(linha.valorCentavos);
      }
    }
  }

  let possivelExcessoCentavos = 0n;
  let possivelExcessoIncompleto = false;
  for (const grupo of grupos.values()) {
    if (grupo.membros < 2) {
      continue;
    }
    if (grupo.ilegivel || grupo.menor === null) {
      possivelExcessoIncompleto = true;
      continue;
    }
    possivelExcessoCentavos += grupo.soma - BigInt(grupo.menor);
  }

  return {
    guias,
    ok,
    pendentes,
    falhasProcessamento,
    valorRegistradoCentavos: publicarCentavos(valorRegistradoCentavos),
    totalIncompleto,
    exposicaoCentavos: publicarCentavos(
      exposicaoEstruturadaCentavos + exposicaoTextualDuplicidadeCentavos,
    ),
    exposicaoEstruturadaCentavos: publicarCentavos(exposicaoEstruturadaCentavos),
    exposicaoTextualDuplicidadeCentavos: publicarCentavos(
      exposicaoTextualDuplicidadeCentavos,
    ),
    possivelExcessoCentavos: publicarCentavos(possivelExcessoCentavos),
    possivelExcessoIncompleto,
    valorSemPendenciaCentavos: publicarCentavos(valorSemPendenciaCentavos),
    porCodigo,
    porConvenio,
    porUnidade,
    referenciasTemporais: [...referenciasTemporais].sort(),
    periodo,
    referencia,
  };
}
