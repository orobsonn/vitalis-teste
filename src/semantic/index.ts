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
  MODELO_OBSERVACAO,
  ErroModeloInvalido,
  ErroTetoDeAbuso,
  criarInterpretadorWorkersAi,
} from "./workers-ai";
export type {
  BindingAi,
  OpcoesInterpretadorWorkersAi,
} from "./workers-ai";

export {
  LIMITE_VALOR_CACHE_BYTES,
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

export {
  JANELA_PADRAO_MS,
  LIMITE_PADRAO_CHAMADAS,
  criarQuotaDeChamadas,
} from "./quota";
export type {
  ObservadorContadores,
  OpcoesQuotaDeChamadas,
  QuotaDeChamadas,
} from "./quota";

export {
  MAXIMO_TENTATIVAS,
  LIMITE_CONTEXTO,
  LIMITE_OBSERVACAO,
  LIMITE_RESPOSTA_BYTES,
  LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE,
  LIMITACAO_QUOTA_EXCEDIDA,
  TIMEOUT_PADRAO_MS,
  conferirGuia,
} from "./conferencia";
export type { ClassificacaoFalha, OpcoesConferencia } from "./conferencia";

export {
  CHAVES_PERMITIDAS,
  CLASSIFICACOES_ESTAVEIS,
  COMPRIMENTO_MAXIMO_CACHE_PREFIXO,
  criarRegistradorRedigido,
} from "./observabilidade";
export type {
  CamposPermitidos,
  ChavePermitida,
  ClassificacaoEstavel,
  EventoRedigido,
  OpcoesRegistradorRedigido,
  RegistradorRedigido,
} from "./observabilidade";
