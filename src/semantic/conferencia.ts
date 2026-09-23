/**
 * Conferência central de uma guia (§3.6/§3.7/§3.9).
 *
 * Único caminho compartilhado por web, MCP e Skill: compõe o motor determinístico
 * (`verificarGuia`) com a extração semântica cacheada, quota best-effort,
 * timeout por tentativa, no máximo uma retentativa transitória, validação fechada
 * da resposta e entrega textual ao motor.
 *
 * Garantias do contrato:
 * - Observação vazia após `trim` PRECEDE os tetos de abuso (§3.6): sai pelo
 *   motor puro (`nao_aplicavel`), sem cache, sem quota e sem inferência — o
 *   único trabalho antes dos tetos é a varredura linear do vazio, sem cópia,
 *   hash, serialização, cache ou envio. O texto CRU é preservado na chave e no
 *   payload, e o `trim` serve apenas para vazio e limites.
 * - O teto ABSOLUTO de ABUSO em BYTES UTF-8 do texto CRU
 *   (`LIMITE_TEXTO_BRUTO_BYTES`, 64 KiB) é aplicado POR CAMPO do payload do
 *   provedor — observação, convênio e procedimento — ANTES de qualquer `trim()`
 *   e SOMENTE para observação NÃO vazia, recusando entradas desproporcionais
 *   antes de cache/hash/envio; o risco residual de custo/corpo cru pertence
 *   sobretudo ao limite de corpo do entrypoint HTTP (issues #4/#6), não a este
 *   contrato.
 * - A identidade CONFIGURADA (`opcoes.modelo`) tem um teto COMPARTILHADO de 200
 *   caracteres (`LIMITE_IDENTIDADE_CONFIGURADA`), medido ANTES do cache, da
 *   chamada e do resultado: acima dele a conferência falha fechada sem ecoar o
 *   valor.
 * - ÚNICOS limites SEMÂNTICOS de entrada são os TRIMADOS (1000 observação,
 *   200 contexto); o texto CRU é preservado na chave e no payload.
 * - Quota antes de cada tentativa, com uma ÚNICA instância padrão do isolate
 *   (60/60000 ms) usada quando a quota é omitida ou `null`.
 * - Cache miss/hit, timeout real por tentativa
 *   (`setTimeout`), retentativa apenas para falha `transporte` com `status`
 *   transitório PRÓPRIO do erro (429/5xx),
 *   resposta acima de 16 KiB rejeitada antes do parse e gravação best-effort.
 * - Falha fechada: erro, timeout, configuração ausente, schema/evidência/limite,
 *   quota e observação acima do teto produzem `incompleta` com os achados
 *   determinísticos preservados; `inferencia_textual` só é nula sem tentativa.
 * - Nenhum `console.*`; eventos apenas pelo `RegistradorRedigido` com o
 *   vocabulário fechado e campos da allowlist.
 */

import type { Catalogo } from "../domain/catalogo";
import type { DataCivil } from "../domain/datas";
import { verificarGuia } from "../domain/motor";
import type { ResultadoVerificacao } from "../domain/motor";
import type { GuiaNormalizada } from "../domain/normalizacao";
import type { TextualValidado } from "../domain/policies/textuais";

import { montarChaveCacheSemantica } from "./cache";
import type { AdaptadorCacheSemantico, ContextoChaveCacheSemantica } from "./cache";
import type {
  EntradaObservacao,
  InterpretadorObservacao,
  RespostaBruta,
  SinaisObservacao,
} from "./contratos";
import type {
  CamposPermitidos,
  ClassificacaoEstavel,
  RegistradorRedigido,
} from "./observabilidade";
import { PROMPT_HASH, versaoEfetivaDoPrompt } from "./prompt";
import { criarQuotaDeChamadas } from "./quota";
import type { ObservadorContadores, QuotaDeChamadas } from "./quota";
import { validarExtracao } from "./validacao";
import { MODELO_OBSERVACAO } from "./workers-ai";

/** Teto de caracteres da observação após `trim` (§3.9). */
export const LIMITE_OBSERVACAO = 1000;
/** Teto de caracteres de convênio e de procedimento após `trim` (§3.9). */
export const LIMITE_CONTEXTO = 200;
/**
 * Teto COMPARTILHADO, em caracteres, da identidade CONFIGURADA
 * (`opcoes.modelo`): a identidade efetiva é aplicada em cache, chamada e
 * resultado, então uma configuração acima do teto falha fechada antes de
 * qualquer leitura, chamada ou eco — o valor hostil nunca é copiado
 * integralmente para `inferencia_textual`. O mesmo limite semântico de
 * contexto.
 */
const LIMITE_IDENTIDADE_CONFIGURADA = 200;
/**
 * Teto ABSOLUTO de ABUSO de CADA campo cru do payload do provedor, em BYTES
 * UTF-8 (§3.9), medido ANTES de `trim`, cache, hash e envio. Não é um limite
 * semântico: os únicos limites semânticos de entrada continuam sendo os
 * TRIMADOS (`LIMITE_OBSERVACAO`/`LIMITE_CONTEXTO`). Alinhado ao limite de corpo
 * HTTP aprovado, recusa entradas desproporcionais sem restaurar o teto cru
 * pequeno. Vale para observação, convênio e procedimento.
 */
export const LIMITE_TEXTO_BRUTO_BYTES = 64 * 1024;
/** Teto, em bytes UTF-8, da resposta serializada do provedor (§3.9). */
export const LIMITE_RESPOSTA_BYTES = 16 * 1024;
/** Timeout padrão por tentativa, em milissegundos (§3.9). */
export const TIMEOUT_PADRAO_MS = 5000;
/** Número máximo de tentativas por conferência: original + uma retentativa. */
export const MAXIMO_TENTATIVAS = 2;

/**
 * Quota padrão do isolate (§3.9): UMA única instância criada no carregamento do
 * módulo (60 chamadas / 60000 ms) e compartilhada por toda `conferirGuia` que
 * não receba quota injetada. Nunca é criada por chamada.
 */
const QUOTA_PADRAO = criarQuotaDeChamadas();

/** Limitação nomeada da observação acima do teto de entrada (§3.9). */
export const LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE = "observacao_acima_do_limite";
/** Limitação nomeada da quota excedida, resolvida nesta tarefa a partir de §3.9. */
export const LIMITACAO_QUOTA_EXCEDIDA = "quota_de_chamadas_excedida";

/** Classificação fechada de uma falha de extração (§3.9). */
export type ClassificacaoFalha =
  | "transporte"
  | "timeout"
  | "configuracao"
  | "schema_invalido"
  | "evidencia_invalida"
  | "limite_excedido"
  | "nao_transitorio";

/** Opções injetáveis da conferência central (§3.7). */
export interface OpcoesConferencia {
  /** Referência temporal repassada ao motor. */
  referenciaTemporal?: DataCivil;
  /** Interpretador injetado; ausente/null ⇒ sem tentativa. */
  interpretador?: InterpretadorObservacao | null;
  /** Adaptador real sobre KV; ausente/null ⇒ sem cache. */
  cache?: AdaptadorCacheSemantico | null;
  /** Quota consumida antes de cada tentativa. */
  quota?: QuotaDeChamadas | null;
  /** Registrador redigido dos eventos da allowlist. */
  registrador?: RegistradorRedigido;
  /** Observador dos contadores de operação. */
  observador?: ObservadorContadores;
  /** Modelo fixado por configuração; padrão `MODELO_OBSERVACAO`. */
  modelo?: string;
  /** Timeout por tentativa em ms; padrão `TIMEOUT_PADRAO_MS`. */
  timeoutMs?: number;
  /**
   * Limite temporal, em ms, de ESPERA de CADA operação de cache (leitura E
   * gravação); padrão `TIMEOUT_PADRAO_MS`. O limite cerca a ESPERA, não o efeito
   * de armazenamento: um cache que não responda dentro do prazo degrada a
   * leitura para miss e ABANDONA a gravação — a conferência não a aguarda,
   * conclui `completa` e emite o evento redigido `cache_gravacao_falhou`; uma
   * conclusão tardia da gravação ainda pode persistir best-effort, sem alterar
   * o resultado devolvido nem o evento emitido. Nada disso vira falha da
   * conferência. Normalizado como o timeout por tentativa: só número finito
   * positivo vale; qualquer outra forma usa o padrão.
   */
  timeoutCacheMs?: number;
  /** Relógio injetável para durações observáveis; padrão `Date.now`. */
  agora?: () => number;
  /** Classificador fechado de falha; padrão trata 429/5xx como `transporte`. */
  classificarFalha?: (erro: unknown) => ClassificacaoFalha;
}

const CODIFICADOR = new TextEncoder();

/** Comprimento em bytes UTF-8 do texto serializado da resposta. */
function bytesDoTexto(texto: string): number {
  return CODIFICADOR.encode(texto).length;
}

/**
 * Verdadeiro quando o texto CRU de um campo do payload excede o teto absoluto
 * de abuso em BYTES UTF-8. Medido sempre no valor cru (antes de `trim`), de
 * modo que um campo só-espaços enorme não escape por ter comprimento trimado
 * pequeno. O MESMO teto vale para observação, convênio e procedimento.
 *
 * Pré-checagem barata em UNIDADES de código UTF-16 ANTES de codificar: o
 * comprimento em bytes UTF-8 nunca é menor que a contagem de unidades de
 * código, então um texto acima de `LIMITE_TEXTO_BRUTO_BYTES` unidades já é
 * recusa garantida — evita materializar um buffer codificado de vários
 * megabytes no caso patológico (medido antes do teto EXATO em bytes para
 * strings iguais ou abaixo daquele comprimento).
 */
function acimaDoTetoDeAbuso(texto: string): boolean {
  if (texto.length > LIMITE_TEXTO_BRUTO_BYTES) {
    return true;
  }
  return bytesDoTexto(texto) > LIMITE_TEXTO_BRUTO_BYTES;
}

/**
 * Marcador fixo e PEQUENO que substitui, na representação entregue ao motor,
 * um campo acima do teto de abuso (§3.9). Não vazio e não catalogado, de modo
 * que os códigos determinísticos (`*_nao_catalogado`) sejam preservados sem
 * embutir o corpo rejeitado (nem um prefixo dele) em `motivos[].evidencia`.
 */
const MARCADOR_TETO_ABUSO = "[campo_acima_do_teto_de_abuso]";

/**
 * Aplica o teto ABSOLUTO de abuso a UM campo capturado: o texto cru acima do
 * teto vira o marcador fixo, de modo que nem o campo de topo nem a célula
 * `original` carreguem o corpo rejeitado (amplificação de memória/resposta).
 */
function limitarCampo(texto: string): string {
  return acimaDoTetoDeAbuso(texto) ? MARCADOR_TETO_ABUSO : texto;
}

/** Descritor PRÓPRIO de DADO reutilizável: nenhum acessor é retido. */
function comoDado(value: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: true, configurable: true };
}

/**
 * Os três campos semânticos capturados UMA única vez (§3.7). Cada valor é uma
 * string PRIMITIVA (a validação é do chamador): um objeto com
 * `length`/`trim`/`toJSON` divergentes enganaria os testes de vazio/teto
 * (que só usam `length`/`trim`/`ToString`) enquanto `JSON.stringify` do payload
 * do provedor invocaria `toJSON` e enviaria um corpo gigante.
 */
interface CamposCapturados {
  observacao: string;
  convenio: string;
  procedimento: string;
}

/**
 * Captura ÚNICA dos três campos semânticos: uma leitura `[[Get]]` por campo (um
 * getter hostil é lido EXATAMENTE uma vez, nunca relido — anti-TOCTOU). Um
 * getter que LANCE invalida a captura inteira (`null`): a conferência fecha
 * fechada em vez de rejeitar a Promise.
 */
function capturarCampos(guia: GuiaNormalizada): CamposCapturados | null {
  try {
    const observacao = guia.observacaoRecepcao;
    const convenio = guia.convenio;
    const procedimento = guia.procedimentoCodigo;
    return { observacao, convenio, procedimento };
  } catch {
    return null;
  }
}

const CELULAS_SEMANTICAS_ORIGINAL: readonly string[] = [
  "observacao_recepcao",
  "convenio",
  "procedimento_codigo",
];

/**
 * Reconstrói `original` como objeto SIMPLES de dados: só os descritores
 * PRÓPRIOS de DADO de `guia.original` são copiados (um acessor nunca é
 * avaliado) e as três células CAPTURADAS são sempre sobrepostas. Um `original`
 * que seja ACESSOR fecha fechado (`null`): é um campo consumido pelo motor e
 * avaliá-lo aqui reabriria um getter hostil. Um `original` ausente ou
 * não-objeto é tratado como ausente e reconstruído a partir do trio capturado.
 */
function reconstruirOriginal(
  descritorOriginal: PropertyDescriptor | undefined,
  observacao: string,
  convenio: string,
  procedimento: string,
): Record<string, unknown> | null {
  const base: Record<string, unknown> = {};
  if (descritorOriginal) {
    if (!("value" in descritorOriginal)) {
      return null;
    }
    const fonte = descritorOriginal.value;
    if (typeof fonte === "object" && fonte !== null) {
      let descritoresFonte: Record<string, PropertyDescriptor>;
      try {
        descritoresFonte = Object.getOwnPropertyDescriptors(fonte);
      } catch {
        return null;
      }
      for (const chave of Object.keys(descritoresFonte)) {
        if (CELULAS_SEMANTICAS_ORIGINAL.includes(chave)) {
          continue;
        }
        const descritor = descritoresFonte[chave];
        if (!descritor || !("value" in descritor)) {
          // Acessor numa célula consumida pelo motor: nunca avaliado nem retido.
          return null;
        }
        base[chave] = descritor.value;
      }
    }
  }
  base.observacao_recepcao = observacao;
  base.convenio = convenio;
  base.procedimento_codigo = procedimento;
  return base;
}

/**
 * Snapshot LIMITADO e PURO DE DADOS da guia a partir dos TRÊS campos já
 * CAPTURADOS uma única vez. Os três campos semânticos recebem os valores
 * capturados (com o teto de abuso aplicado); TODAS as demais propriedades
 * próprias só são retidas quando são descritores PRÓPRIOS de DADO. Nenhum
 * acessor é avaliado nem retido: um acessor em QUALQUER campo consumido pelo
 * motor (`procedimentoDescricao`, `original`, etc.) fecha fechado (`null`)
 * para o chamador. A reflexão é guardada (um `Proxy` hostil pode lançar em
 * `ownKeys`/`getOwnPropertyDescriptor`). Não há espalhamento sobre a guia
 * hostil (`{ ...guia }`/`{ ...guia.original }`). Esta é a ÚNICA representação
 * entregue ao motor em TODOS os caminhos. O marcador é não vazio e não
 * catalogado, então `convenio_nao_catalogado` e `procedimento_nao_catalogado`
 * continuam e nenhum falso `*_ausente` aparece.
 */
function guiaComCamposLimitados(
  guia: GuiaNormalizada,
  observacao: string,
  convenio: string,
  procedimento: string,
): GuiaNormalizada | null {
  const observacaoFinal = limitarCampo(observacao);
  const convenioFinal = limitarCampo(convenio);
  const procedimentoFinal = limitarCampo(procedimento);

  let descritores: Record<string, PropertyDescriptor>;
  try {
    descritores = Object.getOwnPropertyDescriptors(guia);
  } catch {
    return null;
  }

  const saida: Record<string, PropertyDescriptor> = {};
  for (const chave of Object.keys(descritores)) {
    if (
      chave === "observacaoRecepcao" ||
      chave === "convenio" ||
      chave === "procedimentoCodigo" ||
      chave === "original"
    ) {
      continue;
    }
    const descritor = descritores[chave];
    if (!descritor || !("value" in descritor)) {
      return null;
    }
    saida[chave] = comoDado(descritor.value);
  }

  const original = reconstruirOriginal(
    descritores.original,
    observacaoFinal,
    convenioFinal,
    procedimentoFinal,
  );
  if (original === null) {
    return null;
  }

  saida.observacaoRecepcao = comoDado(observacaoFinal);
  saida.convenio = comoDado(convenioFinal);
  saida.procedimentoCodigo = comoDado(procedimentoFinal);
  saida.original = comoDado(original);

  try {
    return Object.defineProperties({}, saida) as GuiaNormalizada;
  } catch {
    return null;
  }
}

/**
 * Guia MÍNIMA e LIMITADA do caminho de falha fechada do snapshot (reflexão
 * hostil ou acessor em campo consumido pelo motor): apenas os três campos
 * capturados (com o teto de abuso aplicado) e um `original` com essas mesmas
 * três células. Os demais campos ficam vazios/neutros, de modo que o motor
 * determinístico roda e emite os códigos padrão (`checagem_textual_incompleta`)
 * sem carregar nenhum valor hostil.
 */
function guiaMinima(
  observacao: string,
  convenio: string,
  procedimento: string,
): GuiaNormalizada {
  const observacaoFinal = limitarCampo(observacao);
  const convenioFinal = limitarCampo(convenio);
  const procedimentoFinal = limitarCampo(procedimento);
  const original = {
    observacao_recepcao: observacaoFinal,
    convenio: convenioFinal,
    procedimento_codigo: procedimentoFinal,
  } as unknown as GuiaNormalizada["original"];
  return {
    id: "",
    original,
    linhaOriginal: "",
    unidade: "",
    dataAtendimento: null,
    paciente: "",
    convenio: convenioFinal,
    carteirinha: "",
    cid: "",
    procedimentoCodigo: procedimentoFinal,
    procedimentoDescricao: "",
    numeroAutorizacao: "",
    autorizacaoValidade: null,
    autorizacaoSessoesLimite: null,
    sessaoNumero: null,
    profissional: "",
    profissionalRegistro: "",
    valorCentavos: null,
    observacaoRecepcao: observacaoFinal,
    dataLancamento: null,
    problemas: [],
  };
}

/**
 * Lê `status` numérico de um erro desconhecido sem lançar nem avaliar
 * acessores arbitrários: só a propriedade própria de dado é lida, e qualquer
 * exceção (inclusive de um `Proxy`) na obtenção fecha como sem status.
 */
function statusDoErro(erro: unknown): number | null {
  if (typeof erro !== "object" || erro === null) {
    return null;
  }
  try {
    const descritor = Object.getOwnPropertyDescriptor(erro, "status");
    const status = descritor && "value" in descritor ? descritor.value : undefined;
    if (typeof status === "number" && Number.isFinite(status)) {
      return status;
    }
  } catch {
    return null;
  }
  return null;
}

/** Classificador padrão fechado: só `status === 429` ou `status >= 500` retenta. */
function classificarPadrao(erro: unknown): ClassificacaoFalha {
  const status = statusDoErro(erro);
  if (status === 429 || (status !== null && status >= 500)) {
    return "transporte";
  }
  return "nao_transitorio";
}

/**
 * Só o `status` transitório PRÓPRIO do erro (429 ou ≥500) autoriza a
 * retentativa; usa a mesma leitura guardada de `statusDoErro` (propriedade
 * própria de dado, sem avaliar acessores arbitrários).
 */
function statusTransitorio(erro: unknown): boolean {
  const status = statusDoErro(erro);
  return status === 429 || (status !== null && status >= 500);
}

/** Normaliza o timeout: só número finito positivo; qualquer outra forma usa o padrão. */
function normalizarTimeout(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0
    ? valor
    : TIMEOUT_PADRAO_MS;
}

/**
 * Leitura best-effort do relógio: `agora()` alimenta APENAS a telemetria de
 * `duracao_ms`. Um relógio que lance ou devolva valor não finito degrada para
 * `null` sem nunca rejeitar a conferência nem alterar decisões, chamadas,
 * cache, quota ou resultado; só a duração telemetrável se perde.
 */
function lerRelogio(agora: () => number): number | null {
  try {
    const instante = agora();
    return typeof instante === "number" && Number.isFinite(instante) ? instante : null;
  } catch {
    return null;
  }
}

/**
 * Duração telemetrável entre dois instantes válidos. Devolve `undefined`
 * quando qualquer leitura falha ou é não finita, para que o campo `duracao_ms`
 * seja OMITIDO do evento em vez de emitir `NaN` ou uma duração fictícia.
 */
function medirDuracao(inicio: number | null, agora: () => number): number | undefined {
  if (inicio === null) {
    return undefined;
  }
  const fim = lerRelogio(agora);
  return fim === null ? undefined : Math.max(0, fim - inicio);
}

/** Código estável de observabilidade para uma classificação de falha (§3.10). */
function codigoDaClassificacao(classificacao: ClassificacaoFalha): ClassificacaoEstavel | null {
  switch (classificacao) {
    case "transporte":
      return "erro_transporte";
    case "timeout":
      return "timeout";
    case "schema_invalido":
      return "schema_invalido";
    case "evidencia_invalida":
      return "evidencia_invalida";
    case "limite_excedido":
      return "limite_excedido";
    case "configuracao":
    case "nao_transitorio":
      return null;
  }
}

/** Código estável para uma recusa da validação de extração (§3.10). */
function codigoDaValidacao(erro: string): ClassificacaoEstavel {
  if (erro === "evidencia_invalida") {
    return "evidencia_invalida";
  }
  if (erro === "limite_excedido") {
    return "limite_excedido";
  }
  return "schema_invalido";
}

/**
 * Modelo efetivo da configuração: só uma string não vazia após `trim` é
 * aceita (preservada literalmente, para conferir com a identidade devolvida
 * pelo provedor); qualquer outra forma (`undefined`, vazia, whitespace ou
 * não-string) recai no padrão `MODELO_OBSERVACAO`, nunca numa identidade vazia.
 */
function normalizarModelo(valor: unknown): string {
  return typeof valor === "string" && valor.trim() !== "" ? valor : MODELO_OBSERVACAO;
}

/** Identidade de inferência e de cache, sempre derivada da configuração. */
function contextoDaConfiguracao(modelo: string): ContextoChaveCacheSemantica {
  return {
    modelo,
    promptVersao: versaoEfetivaDoPrompt(),
    promptHash: PROMPT_HASH,
  };
}

/**
 * Emissão best-effort de um evento redigido: TODA a emissão da conferência
 * passa por aqui. Um `RegistradorRedigido` hostil que lance em `info` nunca
 * rejeita a Promise de `conferirGuia` — a exceção é engolida e o evento (ou a
 * falha) permanece descrito pelo `ResultadoVerificacao` devolvido. O nome e os
 * campos de cada evento continuam idênticos; muda apenas o modo de falha.
 */
function emitir(
  registrador: RegistradorRedigido | undefined,
  evento: string,
  campos: CamposPermitidos,
): void {
  try {
    registrador?.info(evento, campos);
  } catch {
    // Logging best-effort: falha do destino nunca vira falha da conferência.
  }
}

/**
 * Notificação best-effort do observador de contadores: TODA notificação da
 * conferência passa por aqui. Um `ObservadorContadores` hostil que lance nunca
 * rejeita a Promise de `conferirGuia` — a exceção é engolida e nenhuma decisão
 * muda (chamadas ao modelo, consumo de quota, leitura/gravação de cache e
 * resultado permanecem idênticos); só a telemetria falha em silêncio. Nunca
 * `console.*`.
 */
function notificarObservador(
  observador: ObservadorContadores | undefined,
  notificar: (observador: ObservadorContadores) => void,
): void {
  if (!observador) {
    return;
  }
  try {
    notificar(observador);
  } catch {
    // Telemetria best-effort: falha do observador nunca vira falha da conferência.
  }
}

/**
 * Leitura guardada de um campo do envelope NÃO CONFIÁVEL do provedor: só uma
 * propriedade PRÓPRIA de DADO cujo `value` seja string é aceita. `null`,
 * primitivos, um descritor de acessor (getter/setter), um `Proxy` ou qualquer
 * exceção de `Object.getOwnPropertyDescriptor` fecham como `null` SEM avaliar
 * o acessor — a fronteira é a resposta do provedor, não o objeto interno.
 */
function lerCampoEnvelope(origem: unknown, chave: string): string | null {
  if (typeof origem !== "object" || origem === null) {
    return null;
  }
  try {
    const descritor = Object.getOwnPropertyDescriptor(origem, chave);
    if (!descritor || !("value" in descritor)) {
      return null;
    }
    return typeof descritor.value === "string" ? descritor.value : null;
  } catch {
    return null;
  }
}

/**
 * Snapshot do envelope não confiável do provedor: exige `texto`, `modelo` e
 * `promptVersao` como strings em propriedades próprias de DADO. Qualquer campo
 * ausente, não-string ou acessor hostil devolve `null`, e o chamador fecha como
 * schema inválido — nenhum acesso direto ao envelope sujo chega a lançar.
 */
function lerEnvelopeResposta(bruto: unknown): RespostaBruta | null {
  const texto = lerCampoEnvelope(bruto, "texto");
  if (texto === null) {
    return null;
  }
  const modelo = lerCampoEnvelope(bruto, "modelo");
  if (modelo === null) {
    return null;
  }
  const promptVersao = lerCampoEnvelope(bruto, "promptVersao");
  if (promptVersao === null) {
    return null;
  }
  return { texto, modelo, promptVersao };
}

/**
 * A resposta só é aceita quando o provedor confirma a identidade configurada
 * (`modelo` e versão efetiva do prompt); uma resposta de outra identidade é
 * tratada como `configuracao` (sem código estável) e nunca é cacheada.
 */
function identidadeConfere(
  resposta: RespostaBruta,
  contexto: ContextoChaveCacheSemantica,
): boolean {
  return resposta.modelo === contexto.modelo && resposta.promptVersao === contexto.promptVersao;
}

/**
 * Leitura guardada do marcador `notificaRecusaNoObservador`: só o primitivo
 * `true` significa que a quota JÁ se auto-reporta; um acessor (ou `Proxy`) que
 * lance, o marcador ausente e qualquer outro valor recaem em "a quota NÃO se
 * auto-reporta", de modo que a orquestração conta a recusa pelo próprio
 * observador sem nunca rejeitar `conferirGuia`. A proveniência do marcador
 * (booleano público forjável) é uma limitação da quota dona; aqui, um marcador
 * desconhecido ou forjado apenas cai na notificação do lado da conferência.
 */
function quotaSeAutoReporta(quota: QuotaDeChamadas): boolean {
  try {
    return quota.notificaRecusaNoObservador === true;
  } catch {
    return false;
  }
}

/** Classifica a falha de uma tentativa sem deixar exceção escapar (fecha como não transitória). */
function classificarFalhaComGuarda(
  classificar: (erro: unknown) => ClassificacaoFalha,
  erro: unknown,
): ClassificacaoFalha {
  try {
    return classificar(erro);
  } catch {
    return "nao_transitorio";
  }
}

type ResultadoTentativa =
  | { tipo: "ok"; resposta: RespostaBruta }
  | { tipo: "timeout" }
  | { tipo: "erro"; erro: unknown };

type ResultadoCorrida<T> =
  | { tipo: "ok"; valor: T }
  | { tipo: "timeout" }
  | { tipo: "erro"; erro: unknown };

/**
 * Corrida limitada por `setTimeout`, mecanismo ÚNICO compartilhado por cada
 * tentativa de extração e por cada operação de cache (leitura E gravação).
 * Uma promessa que nunca resolve é abandonada quando o prazo vence: o timeout
 * ganha a corrida e a promessa em voo é descartada sem sobreposição, sem
 * lançar e sem bloquear a conferência. Uma rejeição também é convertida em
 * resultado fechado, nunca em exceção de `conferirGuia`.
 */
function correrComTimeout<T>(
  iniciar: () => Promise<T>,
  timeoutMs: number,
): Promise<ResultadoCorrida<T>> {
  return new Promise<ResultadoCorrida<T>>((resolve) => {
    let concluido = false;

    const temporizador = setTimeout(() => {
      if (!concluido) {
        concluido = true;
        resolve({ tipo: "timeout" });
      }
    }, timeoutMs);

    const finalizar = (resultado: ResultadoCorrida<T>): void => {
      if (concluido) {
        return;
      }
      concluido = true;
      clearTimeout(temporizador);
      resolve(resultado);
    };

    let promessa: Promise<T>;
    try {
      // Assimilação normalizada: um adaptador estrutural que devolva um
      // não-Promise (ou um thenable hostil) resolve/rejeita a promessa
      // normalizada em vez de lançar de forma síncrona para fora da corrida.
      // `Promise.resolve` nunca lança por um `then` acessor que falhe: o erro
      // vira rejeição da promessa devolvida e é mapeado em resultado fechado.
      promessa = Promise.resolve(iniciar());
    } catch (erro) {
      finalizar({ tipo: "erro", erro });
      return;
    }

    promessa.then(
      (valor) => finalizar({ tipo: "ok", valor }),
      (erro: unknown) => finalizar({ tipo: "erro", erro }),
    );
  });
}

/**
 * Executa uma tentativa de extração com timeout real por `setTimeout`. A
 * tentativa abandonada por timeout nunca dispara nova chamada: o resultado do
 * timeout vence a corrida e a promessa em voo é descartada sem sobreposição.
 */
async function tentarExtracao(
  interpretador: InterpretadorObservacao,
  entrada: EntradaObservacao,
  timeoutMs: number,
): Promise<ResultadoTentativa> {
  const corrida = await correrComTimeout<RespostaBruta>(
    () => interpretador.extrair(entrada),
    timeoutMs,
  );
  if (corrida.tipo === "ok") {
    return { tipo: "ok", resposta: corrida.valor };
  }
  if (corrida.tipo === "timeout") {
    return { tipo: "timeout" };
  }
  return { tipo: "erro", erro: corrida.erro };
}

/**
 * Conferência central de uma guia: vazio pelo motor puro; não vazio por limites,
 * cache, quota, extração com timeout/retentativa, validação e entrega ao motor.
 */
export async function conferirGuia(
  guia: GuiaNormalizada,
  catalogo: Catalogo,
  opcoes: OpcoesConferencia = {},
): Promise<ResultadoVerificacao> {
  // Captura ÚNICA e GUARDADA dos três campos semânticos (§3.7): cada campo é
  // lido EXATAMENTE uma vez via `[[Get]]` (um getter hostil é lido uma vez,
  // nunca relido — anti-TOCTOU) e um getter que LANCE vira captura inválida.
  // Cada valor precisa ser uma string PRIMITIVA: um objeto com
  // `length`/`trim`/`toJSON` divergentes passaria pelo vazio/teto (que só usam
  // `length`/`trim`/`ToString`) enquanto `JSON.stringify` do payload do
  // provedor invocaria `toJSON` e enviaria um corpo gigante.
  const capturado = capturarCampos(guia);
  const campoObservacao =
    capturado !== null && typeof capturado.observacao === "string" ? capturado.observacao : "";
  const campoConvenio =
    capturado !== null && typeof capturado.convenio === "string" ? capturado.convenio : "";
  const campoProcedimento =
    capturado !== null && typeof capturado.procedimento === "string" ? capturado.procedimento : "";
  const capturaValida =
    capturado !== null &&
    typeof capturado.observacao === "string" &&
    typeof capturado.convenio === "string" &&
    typeof capturado.procedimento === "string";

  // Snapshot PURO DE DADOS entregue ao motor: `null` significa falha fechada
  // determinística (reflexão hostil ou acessor em campo consumido). `??` só
  // avalia `guiaMinima` quando o snapshot falhou.
  const snapshot = capturaValida
    ? guiaComCamposLimitados(guia, campoObservacao, campoConvenio, campoProcedimento)
    : null;
  const guiaLimitada = snapshot ?? guiaMinima(campoObservacao, campoConvenio, campoProcedimento);

  const referenciaTemporal = opcoes.referenciaTemporal;
  const registrador = opcoes.registrador;
  const observador = opcoes.observador;
  const agora = opcoes.agora ?? Date.now;
  const inicio = lerRelogio(agora);
  let tentativas = 0;

  const concluir = (
    textual: TextualValidado,
    extras: {
      estado: "completa" | "incompleta";
      limitacoes?: string[];
      codigo?: ClassificacaoEstavel;
    },
    guiaParaMotor: GuiaNormalizada = guiaLimitada,
  ): ResultadoVerificacao => {
    const resultado = verificarGuia(guiaParaMotor, catalogo, { referenciaTemporal, textual });
    for (const limitacao of extras.limitacoes ?? []) {
      if (!resultado.limitacoes.includes(limitacao)) {
        resultado.limitacoes.push(limitacao);
      }
    }
    const duracao = medirDuracao(inicio, agora);
    if (extras.estado === "incompleta") {
      emitir(registrador, "conferencia_falhou", {
        estado: "incompleta",
        ...(extras.codigo ? { codigo: extras.codigo } : {}),
        ...(duracao === undefined ? {} : { duracao_ms: duracao }),
        tentativas,
      });
    } else {
      emitir(registrador, "conferencia_concluida", {
        estado: "completa",
        ...(duracao === undefined ? {} : { duracao_ms: duracao }),
        tentativas,
      });
    }
    return resultado;
  };

  // 0. Falha fechada do snapshot PRECEDE cache, quota e provedor: captura
  // inválida (um dos três campos capturados não é string primitiva, ou um
  // getter lançou) OU snapshot hostil (reflexão que lançou, acessor em campo
  // consumido pelo motor). A MESMA forma de falha de configuração/validação é
  // reutilizada (`PENDENTE`/`incompleta`, `inferencia_textual` nula), a guia
  // mínima sustenta o motor determinístico e nenhum valor hostil é ecoado.
  if (!capturaValida || snapshot === null) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta" },
    );
  }

  // 1. Observação vazia após `trim` PRECEDE os tetos de abuso (§3.6/#ac-1/
  // #uj-4). Uma observação vazia após `trim` sai pelo motor puro
  // (`nao_aplicavel`), sem cache, quota ou inferência — mesmo quando composta
  // só de espaços ACIMA do teto de 64 KiB. O único trabalho antes dos tetos é
  // esta varredura LINEAR do vazio sobre a observação já limitada pelo
  // entrypoint: nada é copiado, serializado, hasheado, cacheado ou enviado
  // nesse caminho, então antecipar o vazio não reabre o custo que o teto de
  // abuso limita. O motor recebe uma representação LIMITADA
  // (`guiaComCamposLimitados`): um convênio/procedimento acima do teto de abuso
  // é trocado por um marcador fixo, de modo que `motivos[].evidencia` nunca
  // embute o corpo rejeitado; a semântica `nao_aplicavel`, os códigos
  // determinísticos (`*_nao_catalogado`) e o zero de cache/quota/modelo
  // permanecem idênticos.
  if (campoObservacao.trim() === "") {
    const resultado = verificarGuia(guiaLimitada, catalogo, { referenciaTemporal });
    const duracao = medirDuracao(inicio, agora);
    emitir(registrador, "conferencia_concluida", {
      estado: "nao_aplicavel",
      ...(duracao === undefined ? {} : { duracao_ms: duracao }),
      tentativas: 0,
    });
    return resultado;
  }

  // 2. Teto ABSOLUTO de abuso (§3.9), APENAS para observação NÃO vazia: BYTES
  // UTF-8 do texto CRU de CADA campo do payload do provedor, medidos ANTES de
  // qualquer `trim()` — um campo só-espaços enorme não escapa por ter
  // comprimento trimado pequeno. Dentro do teto, o texto cru é preservado e o
  // teto trimado segue como o único limite semântico. Acima do teto, falha
  // fechada sem cache e sem chamada. A observação carrega a limitação nomeada;
  // convênio e procedimento espelham o transbordo de contexto pós-trim (sem
  // código novo de limitação, apenas `codigo: "limite_excedido"`). O motor
  // recebe uma representação LIMITADA (`guiaComCamposLimitados`): o campo
  // acima do teto é trocado por um marcador fixo antes de `verificarGuia`, de
  // modo que a evidência determinística (`O convênio "…" não consta no
  // catálogo.`) nunca embute o corpo rejeitado nem um prefixo dele; cache,
  // quota e provedor permanecem intactos (zero leitura/gravação e zero
  // consumo).
  if (acimaDoTetoDeAbuso(campoObservacao)) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      {
        estado: "incompleta",
        limitacoes: [LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE],
        codigo: "limite_excedido",
      },
      guiaLimitada,
    );
  }
  if (acimaDoTetoDeAbuso(campoConvenio) || acimaDoTetoDeAbuso(campoProcedimento)) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta", codigo: "limite_excedido" },
      guiaLimitada,
    );
  }

  // 3. Identidade CONFIGURADA sob teto COMPARTILHADO de 200 caracteres: a
  // identidade efetiva é aplicada em cache, chamada e resultado, então uma
  // configuração acima do teto falha fechada AQUI — ANTES de qualquer leitura
  // de cache, chamada ou eco — reutilizando a MESMA forma de falha de
  // configuração (`PENDENTE`/`incompleta`, `inferencia_textual` nula) usada
  // quando não há interpretador. O valor hostil nunca é copiado para o
  // resultado; exatamente 200 caracteres são aceitos. O comprimento é medido
  // no valor CRU, ANTES de `normalizarModelo`: um valor só-espaços acima do
  // teto seria trimado para vazio e recairia no padrão, escapando da recusa.
  // Aqui ele é recusado como qualquer identidade acima do teto, sem ser
  // trimado, normalizado ou copiado primeiro.
  const modeloCru = opcoes.modelo;
  if (typeof modeloCru === "string" && modeloCru.length > LIMITE_IDENTIDADE_CONFIGURADA) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta" },
    );
  }

  const entrada: EntradaObservacao = {
    observacao_recepcao: campoObservacao,
    convenio: campoConvenio,
    procedimento_codigo: campoProcedimento,
  };
  const modeloEfetivo = normalizarModelo(modeloCru);
  // Guarda redundante: a normalização só pode manter o valor cru (já sob o
  // teto) ou recair no padrão curto, então nunca AUMENTA o comprimento e este
  // teste não dispara quando o teto cru já foi aplicado; permanece como defesa
  // em profundidade para qualquer normalização futura.
  if (modeloEfetivo.length > LIMITE_IDENTIDADE_CONFIGURADA) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta" },
    );
  }
  const contexto = contextoDaConfiguracao(modeloEfetivo);

  // 4. Limites semânticos de entrada (após `trim`), ainda sem cache ou chamada.
  if (campoObservacao.trim().length > LIMITE_OBSERVACAO) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      {
        estado: "incompleta",
        limitacoes: [LIMITACAO_OBSERVACAO_ACIMA_DO_LIMITE],
        codigo: "limite_excedido",
      },
    );
  }
  if (
    campoConvenio.trim().length > LIMITE_CONTEXTO ||
    campoProcedimento.trim().length > LIMITE_CONTEXTO
  ) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta", codigo: "limite_excedido" },
    );
  }

  // 5. Cache semântico: hit válido entrega `completa` sem modelo nem quota.
  // Cada operação de cache (leitura E gravação) corre sob o MESMO limite
  // temporal configurável, com o mesmo mecanismo de corrida por `setTimeout`
  // das tentativas: um KV que aceita a chamada e nunca resolve degrada a
  // leitura para miss e ABANDONA a gravação. O limite cerca a ESPERA, não o
  // efeito de armazenamento: a conferência não aguarda a gravação abandonada,
  // conclui `completa` e emite `cache_gravacao_falhou`, e uma conclusão tardia
  // ainda pode persistir best-effort sem alterar o resultado devolvido nem o
  // evento emitido. Nada aqui trava nem rejeita a conferência.
  const timeoutCacheMs = normalizarTimeout(opcoes.timeoutCacheMs);
  const cache = opcoes.cache ?? null;
  if (cache) {
    let sinais: SinaisObservacao | null = null;
    const leitura = await correrComTimeout<SinaisObservacao | null>(
      () => cache.ler(entrada, contexto),
      timeoutCacheMs,
    );
    if (leitura.tipo === "ok") {
      // §3.8: a MESMA validação de schema/evidência da extração vale para o
      // valor LIDO do cache. Um adaptador estrutural pode RESOLVER uma Promise
      // legítima com um valor truthy que NÃO é `SinaisObservacao`; a truthiness
      // sozinha não pode selecionar o hit. `validarExtracao` aceita o objeto já
      // parseado: só `{ ok: true, sinais }` é hit válido. Um valor
      // inválido/null/malformado — ou um acessor hostil que lance durante a
      // validação — degrada em silêncio para MISS, como a entrada corrompida do
      // adaptador (sem evento de falha); o fluxo segue para a extração, de modo
      // que a conferência nunca rejeita nem deixa um erro de acesso a
      // propriedade escapar.
      try {
        const validacaoCache = validarExtracao(leitura.valor, entrada.observacao_recepcao);
        sinais = validacaoCache.ok ? validacaoCache.sinais : null;
      } catch {
        sinais = null;
      }
    } else {
      sinais = null;
      emitir(registrador, "cache_leitura_falhou", {
        estado: "incompleta",
        codigo: "cache_indisponivel",
        cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
      });
    }
    if (sinais) {
      notificarObservador(observador, (o) => o.registrarCacheHit());
      return concluir(
        {
          estado: "completa",
          sinais,
          modelo: contexto.modelo,
          prompt_versao: contexto.promptVersao,
        },
        { estado: "completa" },
      );
    }
  }

  // 6. Configuração ausente: sem tentativa e sem identidade de inferência.
  const interpretador = opcoes.interpretador ?? null;
  if (!interpretador) {
    return concluir(
      { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
      { estado: "incompleta" },
    );
  }

  const classificar = opcoes.classificarFalha ?? classificarPadrao;
  const timeoutMs = normalizarTimeout(opcoes.timeoutMs);
  // Quota: injetada quando presente; ausente OU `null` usa a instância padrão
  // do isolate (nunca uma nova instância por chamada).
  const quota = opcoes.quota ?? QUOTA_PADRAO;

  // 7. Tentativas estritamente sequenciais, com no máximo uma retentativa.
  for (;;) {
    // Quota consultada sob guarda: um `consumir()` que lance (por exemplo, um
    // observador hostil injetado na quota) é tratado como recusa fechada e cai
    // no MESMO caminho de recusa abaixo — a exceção nunca escapa da conferência
    // nem pula o evento, a contagem e o resultado `incompleta`. O flag distingue
    // o `false` normal da exceção: só o `false` normal pode confiar no marcador
    // de auto-reporte da quota.
    let quotaAutorizou = true;
    let quotaConsumiuLancou = false;
    if (quota) {
      try {
        quotaAutorizou = quota.consumir();
      } catch {
        quotaAutorizou = false;
        quotaConsumiuLancou = true;
      }
    }
    if (!quotaAutorizou) {
      // Contagem única da recusa: quando a quota JÁ se auto-reporta ao
      // observador (`notificaRecusaNoObservador === true`), a orquestração não
      // conta de novo; só quotas sem esse marcador (plain/fake, sem observador,
      // ou com marcador forjado/ilegível) são contadas aqui. A leitura é sempre
      // guardada por `quotaSeAutoReporta`: um acessor que lance NUNCA rejeita a
      // conferência nem pula o evento/contagem. Um `consumir()` que LANÇOU nunca
      // confia no marcador: a quota pode não ter reportado antes de lançar, então
      // a conferência sempre notifica nesse caso (um throw posterior a um report
      // bem-sucedido, no pior caso, conta duas vezes — direção fechada e
      // indetectável a partir de `consumir(): boolean`). Em ambos os casos emite
      // exatamente um `quota_recusada` — antes de `registrarChamada()` e de
      // qualquer envio — e retorna imediatamente, sem segunda contagem.
      if (quotaConsumiuLancou || !quotaSeAutoReporta(quota)) {
        notificarObservador(observador, (o) => o.registrarRecusaQuota());
      }
      emitir(registrador, "quota_recusada", {
        estado: "incompleta",
        codigo: "quota_excedida",
        tentativas,
      });
      return concluir(
        tentativas > 0
          ? {
              estado: "incompleta",
              sinais: null,
              modelo: contexto.modelo,
              prompt_versao: contexto.promptVersao,
            }
          : { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
        {
          estado: "incompleta",
          limitacoes: [LIMITACAO_QUOTA_EXCEDIDA],
          codigo: "quota_excedida",
        },
      );
    }

    notificarObservador(observador, (o) => o.registrarChamada());
    tentativas += 1;
    emitir(registrador, "extracao_iniciada", { tentativas });

    const tentativa = await tentarExtracao(interpretador, entrada, timeoutMs);

    if (tentativa.tipo === "ok") {
      // Envelope NÃO CONFIÁVEL: snapshot guardado ANTES de qualquer acesso a
      // `texto`/`modelo`/`promptVersao`. `null`, primitivo, campo não-string ou
      // acessor hostil vira `null` e fecha como schema inválido
      // (PENDENTE/incompleta, sem retentativa e sem gravação de cache), em vez
      // de rejeitar a Promise. A tentativa ocorreu, então a identidade de
      // inferência é a CONFIGURADA, nunca lida de um envelope sujo.
      const resposta = lerEnvelopeResposta(tentativa.resposta);
      if (!resposta) {
        emitir(registrador, "extracao_falhou", {
          estado: "incompleta",
          codigo: "schema_invalido",
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta", codigo: "schema_invalido" },
        );
      }

      // Identidade efetiva do provedor: só a configurada é aceita. Mismatch
      // fecha sem gravar cache, sem retentar e sem relabelar como padrão. Os
      // metadados do envelope são ENTRADA NÃO CONFIÁVEL e nunca são ecoados; a
      // identidade relatada é sempre a CONFIGURADA, mesmo no mismatch.
      if (!identidadeConfere(resposta, contexto)) {
        emitir(registrador, "extracao_falhou", {
          estado: "incompleta",
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta" },
        );
      }

      // Teto de saída antes do parse.
      if (bytesDoTexto(resposta.texto) > LIMITE_RESPOSTA_BYTES) {
        emitir(registrador, "extracao_falhou", {
          estado: "incompleta",
          codigo: "limite_excedido",
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta", codigo: "limite_excedido" },
        );
      }

      const validacao = validarExtracao(resposta.texto, entrada.observacao_recepcao);
      if (!validacao.ok) {
        const codigo = codigoDaValidacao(validacao.erro);
        emitir(registrador, "extracao_falhou", {
          estado: "incompleta",
          codigo,
          tentativas,
        });
        return concluir(
          {
            estado: "incompleta",
            sinais: null,
            modelo: contexto.modelo,
            prompt_versao: contexto.promptVersao,
          },
          { estado: "incompleta", codigo },
        );
      }

      // Gravação best-effort: falha de KV não fecha a guia. O limite temporal
      // cerca a ESPERA, não o efeito de armazenamento: uma gravação expirada
      // (ou rejeitada) é ABANDONADA — a conferência não a aguarda, emite
      // `cache_gravacao_falhou` e o resultado validado segue `completa`; uma
      // conclusão tardia ainda pode persistir best-effort, sem alterar o
      // resultado devolvido nem o evento emitido.
      if (cache) {
        const gravacao = await correrComTimeout<void>(
          () => cache.gravar(entrada, contexto, validacao.sinais),
          timeoutCacheMs,
        );
        if (gravacao.tipo !== "ok") {
          emitir(registrador, "cache_gravacao_falhou", {
            estado: "incompleta",
            codigo: "cache_indisponivel",
            cache_prefixo: montarChaveCacheSemantica(entrada, contexto).prefixo,
          });
        }
      }

      emitir(registrador, "extracao_concluida", {
        estado: "completa",
        itens: validacao.sinais.sinais.length,
        tentativas,
      });
      return concluir(
        {
          estado: "completa",
          sinais: validacao.sinais,
          modelo: contexto.modelo,
          prompt_versao: contexto.promptVersao,
        },
        { estado: "completa" },
      );
    }

    const classificacao =
      tentativa.tipo === "timeout"
        ? "timeout"
        : classificarFalhaComGuarda(classificar, tentativa.erro);
    const codigoFalha = codigoDaClassificacao(classificacao);
    emitir(registrador, "extracao_falhou", {
      estado: "incompleta",
      ...(codigoFalha ? { codigo: codigoFalha } : {}),
      tentativas,
    });

    // Retentativa exige a classificação `transporte` E o `status` transitório
    // PRÓPRIO do erro (429 ou ≥500): o classificador injetado continua
    // autoritativo na direção negativa, mas não autoriza sozinho a retentativa.
    if (
      classificacao === "transporte" &&
      tentativa.tipo === "erro" &&
      statusTransitorio(tentativa.erro) &&
      tentativas < MAXIMO_TENTATIVAS
    ) {
      continue;
    }

    return concluir(
      {
        estado: "incompleta",
        sinais: null,
        modelo: contexto.modelo,
        prompt_versao: contexto.promptVersao,
      },
      { estado: "incompleta", ...(codigoFalha ? { codigo: codigoFalha } : {}) },
    );
  }
}
