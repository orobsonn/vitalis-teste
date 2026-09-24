/**
 * Contratos da porta de escrita de conferência de guias e do passe de
 * duplicidade.
 *
 * A identidade de armazenamento é `id_guia` (nunca uma entrada de decisão) e
 * todo instante é injetado pelo chamador (`agora`), sem `Date.now` interno.
 */

import type { Catalogo, GuiaNormalizada, Motivo, ResultadoVerificacao } from "../../domain";
import type { RevisaoPersistida, ValidacaoPersistida } from "../../storage";

/** Extração semântica já validada, pronta para persistir. */
export interface ExtracaoSemanticaPersistivel {
  observacaoHash: string;
  modelo: string;
  promptVersao: string;
  sinais: unknown[];
  situacao: unknown;
  ambiguidades: unknown[];
}

/** Conferência fornecida: resultado determinístico + extração opcional. */
export interface ConferenciaPersistivel {
  resultado: ResultadoVerificacao;
  extracao: ExtracaoSemanticaPersistivel | null;
}

/** Guarda de posse por linha reivindicada (J18). */
export interface GuardaPosse {
  linhaId: string;
  token: string;
}

export interface OpcoesPersistencia {
  guia: GuiaNormalizada;
  conferencia: ConferenciaPersistivel;
  idempotencyKey?: string;
  importId?: string;
  regras: Catalogo;
  agora: string;
  guarda?: GuardaPosse;
}

export type TipoPersistencia = "criada" | "reaproveitada" | "conflito_idempotencia";

export interface ResultadoPersistencia {
  tipo: TipoPersistencia;
  revisao?: RevisaoPersistida;
  validacao?: ValidacaoPersistida;
}

export interface ResultadoPreparo extends ResultadoPersistencia {
  statements: D1PreparedStatement[];
}

export interface OpcoesDuplicidade {
  agora: string;
}

export interface ResultadoDuplicidade {
  alteracoes: number;
}

export interface OpcoesAdHoc {
  guia: GuiaNormalizada;
  conferencia: ConferenciaPersistivel;
  regras: Catalogo;
  agora: string;
}

export interface ResultadoAdHoc {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
}

/** Conteúdo canônico cujo digest forma o id determinístico de uma validação. */
export interface ConteudoValidacao {
  decisao: string;
  checagemTextual: string;
  referenciaTemporal: string | null;
  regrasVersao: string;
  regrasHash: string;
  rulesetId: string;
  inferenciaModelo: string | null;
  inferenciaPromptVersao: string | null;
  orientacoes: unknown;
  limitacoes: unknown;
  extracaoId: string | null;
  processadoEm: string;
}
