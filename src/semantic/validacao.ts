/**
 * Validação determinística da extração semântica de observações.
 *
 * Recebe a resposta bruta (texto JSON ou objeto já parseado, no caminho da
 * revalidação de cache) e devolve `SinaisObservacao` somente quando o schema
 * fechado, os limites, a exclusividade, a coerência bidirecional e a literalidade
 * das evidências estão todos satisfeitos. Fail-closed: qualquer evidência
 * inválida invalida a extração inteira (§3.3/§3.4).
 */

import { z } from "zod";

import { TIPOS_AMBIGUIDADE, TIPOS_SINAL } from "./contratos";
import type { SinaisObservacao } from "./contratos";

/** Cardinalidade máxima de sinais por extração. */
export const LIMITE_SINAIS = 8;
/** Cardinalidade máxima de ambiguidades por extração. */
export const LIMITE_AMBIGUIDADES = 3;
/** Comprimento máximo, em caracteres crus, de cada evidência. */
export const LIMITE_EVIDENCIA = 500;
/** Comprimento mínimo da evidência normalizada. */
export const MIN_CARACTERES_EVIDENCIA = 6;
/** Mínimo de letras/dígitos (`\p{L}`/`\p{N}`) na evidência normalizada. */
export const MIN_LETRAS_DIGITOS_EVIDENCIA = 4;

/** Código estável de recusa da validação de extração. */
export type CodigoErroExtracao =
  | "json_invalido"
  | "estrutura_invalida"
  | "limite_excedido"
  | "duplicidade"
  | "coerencia_invalida"
  | "evidencia_invalida";

/** Resultado da validação: extração aceita ou código de recusa estável. */
export type ResultadoValidacaoExtracao =
  | { ok: true; sinais: SinaisObservacao }
  | { ok: false; erro: CodigoErroExtracao };

const CARACTERE_ALFANUMERICO = /[\p{L}\p{N}]/u;

const SINAL_SCHEMA = z.strictObject({
  tipo: z.enum(TIPOS_SINAL),
  evidencia: z.string(),
});

const AMBIGUIDADE_SCHEMA = z.strictObject({
  tipo: z.enum(TIPOS_AMBIGUIDADE),
  evidencia: z.string(),
});

const SITUACAO_SCHEMA = z.strictObject({
  autorizacao: z.enum(["nenhuma", "nova_nao_cadastrada", "verbal_sem_numero"]),
  modalidade: z.enum(["nenhuma", "particular_decidido", "somente_pergunta"]),
  procedimento: z.enum(["nenhuma", "realizado_divergente"]),
  reagendamento: z.enum(["nenhum", "mencionado"]),
});

const EXTRACAO_SCHEMA = z.strictObject({
  sinais: z.array(SINAL_SCHEMA),
  situacao: SITUACAO_SCHEMA,
  ambiguidades: z.array(AMBIGUIDADE_SCHEMA),
});

/**
 * Normaliza um texto de evidência: colapsa `\s+` em um único espaço e aplica
 * `trim`, preservando a caixa (tolerância apenas de espaço em branco).
 */
export function normalizarEvidencia(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function contarAlfanumericos(texto: string): number {
  return (texto.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

function evidenciaEhLiteral(evidencia: string, textoObservacao: string): boolean {
  const evidenciaNormalizada = normalizarEvidencia(evidencia);
  if (evidenciaNormalizada.length < MIN_CARACTERES_EVIDENCIA) {
    return false;
  }
  if (contarAlfanumericos(evidenciaNormalizada) < MIN_LETRAS_DIGITOS_EVIDENCIA) {
    return false;
  }

  const textoNormalizado = normalizarEvidencia(textoObservacao);
  let indice = textoNormalizado.indexOf(evidenciaNormalizada);
  if (indice < 0) {
    return false;
  }

  // Aceita se QUALQUER ocorrência contígua estiver alinhada a palavras;
  // uma ocorrência embutida em outra palavra não impede uma posterior alinhada.
  while (indice >= 0) {
    const antes = indice > 0 ? textoNormalizado.charAt(indice - 1) : "";
    const depois =
      indice + evidenciaNormalizada.length < textoNormalizado.length
        ? textoNormalizado.charAt(indice + evidenciaNormalizada.length)
        : "";
    if (!CARACTERE_ALFANUMERICO.test(antes) && !CARACTERE_ALFANUMERICO.test(depois)) {
      return true;
    }
    indice = textoNormalizado.indexOf(evidenciaNormalizada, indice + 1);
  }
  return false;
}

function dentroDosLimites(sinais: SinaisObservacao): boolean {
  if (sinais.sinais.length > LIMITE_SINAIS) {
    return false;
  }
  if (sinais.ambiguidades.length > LIMITE_AMBIGUIDADES) {
    return false;
  }
  const evidencias = [
    ...sinais.sinais.map((sinal) => sinal.evidencia),
    ...sinais.ambiguidades.map((ambiguidade) => ambiguidade.evidencia),
  ];
  return evidencias.every((evidencia) => evidencia.length <= LIMITE_EVIDENCIA);
}

function semDuplicidade(sinais: SinaisObservacao): boolean {
  const vistos = new Set<string>();
  for (const sinal of sinais.sinais) {
    if (sinal.tipo === "nota_administrativa") {
      continue;
    }
    if (vistos.has(sinal.tipo)) {
      return false;
    }
    vistos.add(sinal.tipo);
  }
  return true;
}

function situacaoCoerente(sinais: SinaisObservacao): boolean {
  const tipos = new Set(sinais.sinais.map((sinal) => sinal.tipo));
  const { situacao } = sinais;

  const autorizacaoOk =
    tipos.has("autorizacao_nova_nao_cadastrada") ===
      (situacao.autorizacao === "nova_nao_cadastrada") &&
    tipos.has("autorizacao_verbal_sem_numero") === (situacao.autorizacao === "verbal_sem_numero");

  const modalidadeOk =
    tipos.has("decisao_por_particular") === (situacao.modalidade === "particular_decidido") &&
    tipos.has("pergunta_sobre_preco_particular") === (situacao.modalidade === "somente_pergunta");

  const procedimentoOk =
    tipos.has("procedimento_realizado_divergente") ===
    (situacao.procedimento === "realizado_divergente");

  const reagendamentoOk =
    tipos.has("reagendamento_mencionado") === (situacao.reagendamento === "mencionado");

  return autorizacaoOk && modalidadeOk && procedimentoOk && reagendamentoOk;
}

function evidenciasLiterais(sinais: SinaisObservacao, textoObservacao: string): boolean {
  return (
    sinais.sinais.every((sinal) => evidenciaEhLiteral(sinal.evidencia, textoObservacao)) &&
    sinais.ambiguidades.every((ambiguidade) =>
      evidenciaEhLiteral(ambiguidade.evidencia, textoObservacao),
    )
  );
}

/**
 * Valida a resposta bruta da extração contra o schema fechado e as invariáveis
 * de confiança, na precedência fixa de erro:
 * `json_invalido` → `estrutura_invalida` → `limite_excedido` → `duplicidade`
 * → `coerencia_invalida` → `evidencia_invalida`.
 */
export function validarExtracao(
  valorBruto: unknown,
  textoObservacao: string,
): ResultadoValidacaoExtracao {
  let valor = valorBruto;
  if (typeof valor === "string") {
    try {
      valor = JSON.parse(valor);
    } catch {
      return { ok: false, erro: "json_invalido" };
    }
  }

  const parse = EXTRACAO_SCHEMA.safeParse(valor);
  if (!parse.success) {
    return { ok: false, erro: "estrutura_invalida" };
  }
  const sinais: SinaisObservacao = parse.data;

  if (!dentroDosLimites(sinais)) {
    return { ok: false, erro: "limite_excedido" };
  }
  if (!semDuplicidade(sinais)) {
    return { ok: false, erro: "duplicidade" };
  }
  if (!situacaoCoerente(sinais)) {
    return { ok: false, erro: "coerencia_invalida" };
  }
  if (!evidenciasLiterais(sinais, textoObservacao)) {
    return { ok: false, erro: "evidencia_invalida" };
  }

  return { ok: true, sinais };
}
