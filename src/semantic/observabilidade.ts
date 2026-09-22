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
 * - `evento` vem do primeiro argumento, nunca de `campos.evento`.
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

/** Registrador redigido consumido pela orquestração. */
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

const CONJUNTO_CLASSIFICACOES: ReadonlySet<string> = new Set(
  CLASSIFICACOES_ESTAVEIS,
);

const CHAVE_HEXADECIMAL = /^[0-9a-f]+$/;

const CAMPOS_NUMERICOS = ["duracao_ms", "tentativas", "itens"] as const;

/**
 * Redige os campos candidatos em um `EventoRedigido`. Cada chave é avaliada
 * isoladamente contra a allowlist e o tipo esperado; nada é copiado em bloco.
 */
function redigir(evento: string, campos: CamposPermitidos): EventoRedigido {
  const redigido: EventoRedigido = { evento };

  const estado = campos.estado;
  if (typeof estado === "string") {
    redigido.estado = estado;
  }

  const codigo = campos.codigo;
  if (typeof codigo === "string" && CONJUNTO_CLASSIFICACOES.has(codigo)) {
    redigido.codigo = codigo;
  }

  const prefixo = campos.cache_prefixo;
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
    const valor = campos[chave];
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
      destino(redigir(evento, campos));
    },
  };
}
