/**
 * Superfície pública da interpretação semântica de observações.
 *
 * Barrel único do caminho central (§3.7): reexporta contratos, prompt versionado
 * e validação da extração. É por aqui que web, MCP e Skill consomem a camada
 * semântica nas issues seguintes.
 */

export {
  LIMITE_TEXTO_BRUTO_BYTES,
  LITERAIS_SITUACAO,
  TIPOS_AMBIGUIDADE,
  TIPOS_SINAL,
  VALORES_SITUACAO,
  campoTemTamanhoDeAbuso,
} from "./contratos";
export type {
  Ambiguidade,
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
  Sinal,
  SinaisObservacao,
  SituacaoTextual,
  TipoAmbiguidade,
  TipoSinal,
} from "./contratos";

export {
  PROMPT_HASH,
  TEXTO_PROMPT,
  VERSAO_PROMPT,
  hashDoPrompt,
  versaoEfetivaDoPrompt,
} from "./prompt";

export {
  LIMITE_AMBIGUIDADES,
  LIMITE_EVIDENCIA,
  LIMITE_SINAIS,
  MIN_CARACTERES_EVIDENCIA,
  MIN_LETRAS_DIGITOS_EVIDENCIA,
  normalizarEvidencia,
  validarExtracao,
} from "./validacao";
export type {
  CodigoErroExtracao,
  ResultadoValidacaoExtracao,
} from "./validacao";
