/**
 * Registro redigido do núcleo semântico com allowlist fechada (§3.10, §3.1).
 *
 * Responsabilidade única: montar um `EventoRedigido` a partir de campos
 * arbitrários, copiando **somente** chaves e tipos previamente autorizados e
 * entregando-o a um destino injetável. Nenhum objeto de entrada é repassado
 * inteiro, nenhuma string livre atravessa e nenhum `console.*` é chamado.
 *
 * Garantias do contrato (§3.10, #ac-14, #ac-23):
 * - Allowlist fechada `CHAVES_PERMITIDAS`: qualquer outra chave é descartada
 *   antes de registrar (observação, `id_guia`, paciente, carteirinha,
 *   autorização, profissional, registro, prompt, resposta e corpo de erro não
 *   têm por onde sair).
 * - `codigo` só passa se for exatamente uma `CLASSIFICACOES_ESTAVEIS`; string
 *   livre de provedor é descartada, sem remapeamento.
 * - `cache_prefixo` é normalizado para minúsculas, aceita apenas hex `[0-9a-f]`
 *   e é truncado a 12 caracteres — o sufixo do hash nunca vaza.
 * - `duracao_ms`, `tentativas` e `itens` só passam como `number` finito.
 * - `evento` vem do primeiro argumento, nunca de `campos.evento`, e precisa ser
 *   **membro exato do vocabulário fechado `EVENTOS_PERMITIDOS`**: qualquer outro
 *   texto — inclusive string livre sintaticamente válida como
 *   `info("paciente_joao_da_silva", {})` ou `info("invalid_api_key", {})` —
 *   descarta o evento inteiro antes de registrar. Não é canal de dados — é o
 *   nome da operação, pertencente ao vocabulário controlado pelo desenvolvedor.
 * - `estado` só atravessa se pertencer ao conjunto fechado `ESTADOS_CHECAGEM`
 *   de §3.6 (`nao_aplicavel`, `completa`, `incompleta`).
 * - Cada campo é lido apenas como **propriedade própria de dados** via
 *   `Object.getOwnPropertyDescriptor`: propriedades herdadas e accessors/getters
 *   não são avaliados nem atravessam.
 */

import type { ObservadorContadores } from "./quota";

/** Chaves que podem atravessar o registrador redigido (§3.10). */
export const CHAVES_PERMITIDAS = [
  "evento",
  "estado",
  "codigo",
  "cache_prefixo",
  "duracao_ms",
  "tentativas",
  "itens",
] as const;

/** Classificações estáveis aceitas em `codigo` (§3.10). */
export const CLASSIFICACOES_ESTAVEIS = [
  "erro_transporte",
  "timeout",
  "schema_invalido",
  "evidencia_invalida",
  "limite_excedido",
  "quota_excedida",
  "cache_indisponivel",
] as const;

/** Código estável pertencente ao conjunto fechado de §3.10. */
export type ClassificacaoEstavel = (typeof CLASSIFICACOES_ESTAVEIS)[number];

/** Estados fechados da checagem textual aceitos em `estado` (§3.6). */
export const ESTADOS_CHECAGEM = [
  "nao_aplicavel",
  "completa",
  "incompleta",
] as const;

/** Estado de checagem textual pertencente ao conjunto fechado de §3.6. */
export type EstadoChecagem = (typeof ESTADOS_CHECAGEM)[number];

/** Chave permitida no registro redigido (§3.10). */
export type ChavePermitida = (typeof CHAVES_PERMITIDAS)[number];

/** Evento já redigido: exatamente as chaves da allowlist. */
export interface EventoRedigido {
  evento: string;
  estado?: string;
  codigo?: string;
  cache_prefixo?: string;
  duracao_ms?: number;
  tentativas?: number;
  itens?: number;
}

/** Campos candidatos fornecidos pelo chamador; só a allowlist sobrevive. */
export interface CamposPermitidos {
  [chave: string]: unknown;
}

/**
 * Registrador redigido consumido pela orquestração.
 *
 * O parâmetro `evento` é `string` por contrato (§3.7): a assinatura pública não
 * restringe estaticamente o nome da operação. A pertinência ao vocabulário
 * fechado `EVENTOS_PERMITIDOS` é um controle **de runtime**, exercido por
 * `redigir`/`ehEventoPermitido` — texto livre é descartado sem registrar.
 */
export interface RegistradorRedigido {
  info(evento: string, campos: CamposPermitidos): void;
}

/** Opções do registrador redigido. */
export interface OpcoesRegistradorRedigido {
  /** Observador injetável de contadores; aceito e mantido disponível. */
  observador?: ObservadorContadores;
}

/** Comprimento máximo do prefixo hex observável de `cache_prefixo` (§3.10). */
export const COMPRIMENTO_MAXIMO_CACHE_PREFIXO = 12;

/**
 * Vocabulário fechado de nomes de evento desta superfície semântica (§3.10).
 * Não é canal de dados: fora deste conjunto o evento é descartado, mesmo que a
 * string pareça um identificador válido (`paciente_joao_da_silva`, `invalid_api_key`).
 */
export const EVENTOS_PERMITIDOS = [
  "extracao_iniciada",
  "extracao_concluida",
  "extracao_falhou",
  "cache_leitura_falhou",
  "cache_gravacao_falhou",
  "quota_recusada",
  "conferencia_iniciada",
  "conferencia_concluida",
  "conferencia_falhou",
] as const;

/** Nome de evento pertencente ao vocabulário fechado de §3.10. */
export type EventoPermitido = (typeof EVENTOS_PERMITIDOS)[number];

const CONJUNTO_CLASSIFICACOES: ReadonlySet<string> = new Set(
  CLASSIFICACOES_ESTAVEIS,
);

const CONJUNTO_EVENTOS: ReadonlySet<string> = new Set(EVENTOS_PERMITIDOS);

const CONJUNTO_ESTADOS: ReadonlySet<string> = new Set(ESTADOS_CHECAGEM);

const CHAVE_HEXADECIMAL = /^[0-9a-f]+$/;

const CAMPOS_NUMERICOS = ["duracao_ms", "tentativas", "itens"] as const;

/**
 * Lê um campo como **propriedade própria de dados**. `getOwnPropertyDescriptor`
 * só enxerga propriedades próprias (herdadas são ignoradas) e accessors/getters
 * não têm `value`, portanto nunca são avaliados nem atravessam. Fonte que não é
 * objeto é tratada como vazia.
 */
function lerCampoProprio(campos: unknown, chave: string): unknown {
  if (
    campos === null ||
    (typeof campos !== "object" && typeof campos !== "function")
  ) {
    return undefined;
  }

  const descritor = Object.getOwnPropertyDescriptor(campos, chave);
  if (descritor === undefined || !("value" in descritor)) {
    return undefined;
  }

  return descritor.value;
}

/**
 * Aceita somente nome de evento do vocabulário fechado de §3.10 (nunca texto
 * livre): valida em runtime a pertinência ao `Set` derivado de
 * `EVENTOS_PERMITIDOS`.
 */
function ehEventoPermitido(evento: unknown): evento is EventoPermitido {
  return typeof evento === "string" && CONJUNTO_EVENTOS.has(evento);
}

/**
 * Redige os campos candidatos em um `EventoRedigido`. Cada chave é avaliada
 * isoladamente contra a allowlist e o tipo esperado; nada é copiado em bloco.
 * Devolve `undefined` quando o `evento` não pertence ao vocabulário fechado —
 * nesse caso o evento inteiro é descartado antes de registrar.
 */
function redigir(
  evento: unknown,
  campos: unknown,
): EventoRedigido | undefined {
  if (!ehEventoPermitido(evento)) {
    return undefined;
  }

  const redigido: EventoRedigido = { evento };

  const estado = lerCampoProprio(campos, "estado");
  if (typeof estado === "string" && CONJUNTO_ESTADOS.has(estado)) {
    redigido.estado = estado;
  }

  const codigo = lerCampoProprio(campos, "codigo");
  if (typeof codigo === "string" && CONJUNTO_CLASSIFICACOES.has(codigo)) {
    redigido.codigo = codigo;
  }

  const prefixo = lerCampoProprio(campos, "cache_prefixo");
  if (typeof prefixo === "string") {
    const normalizado = prefixo.toLowerCase();
    if (CHAVE_HEXADECIMAL.test(normalizado)) {
      redigido.cache_prefixo = normalizado.slice(
        0,
        COMPRIMENTO_MAXIMO_CACHE_PREFIXO,
      );
    }
  }

  for (const chave of CAMPOS_NUMERICOS) {
    const valor = lerCampoProprio(campos, chave);
    if (typeof valor === "number" && Number.isFinite(valor)) {
      redigido[chave] = valor;
    }
  }

  return redigido;
}

/**
 * Cria um registrador redigido sobre um destino injetável. O único caminho de
 * saída é `destino(eventoRedigido)`: sem console direto, sem rede e sem KV.
 */
export function criarRegistradorRedigido(
  destino: (evento: EventoRedigido) => void,
  opcoes: OpcoesRegistradorRedigido = {},
): RegistradorRedigido {
  void opcoes.observador;

  return {
    info(evento: string, campos: CamposPermitidos): void {
      const redigido = redigir(evento, campos);
      if (redigido === undefined) {
        return;
      }

      destino(redigido);
    },
  };
}
