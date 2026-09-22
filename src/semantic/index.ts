/**
 * Superfície pública da interpretação semântica de observações.
 *
 * Barrel único do caminho central (§3.7): reexporta contratos, prompt versionado
 * e validação da extração. É por aqui que web, MCP e Skill consomem a camada
 * semântica nas issues seguintes.
 */

export {
  TIPOS_AMBIGUIDADE,
  TIPOS_SINAL,
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

export { MODELO_OBSERVACAO, criarInterpretadorWorkersAi } from "./workers-ai";
export type {
  BindingAi,
  OpcoesInterpretadorWorkersAi,
} from "./workers-ai";

export {
  NAMESPACE_CACHE_SEMANTICO,
  TTL_PADRAO_CACHE_SEGUNDOS,
  criarAdaptadorCacheSemantico,
  montarChaveCacheSemantica,
} from "./cache";
export type {
  AdaptadorCacheSemantico,
  BindingCacheSemantico,
  ChaveCacheSemantica,
  ContextoChaveCacheSemantica,
  OpcoesAdaptadorCacheSemantico,
} from "./cache";

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
