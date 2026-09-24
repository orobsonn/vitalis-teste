/**
 * Contratos tipados da camada de armazenamento (D1).
 *
 * Nenhuma decisão de negócio mora aqui: apenas a forma persistida e os
 * resultados de leitura/escrita consumidos pela aplicação e pelos relatórios.
 * Timestamps são sempre texto ISO injetado pelo chamador (J8) — nada usa
 * `Date.now` internamente.
 */

export type TimestampIso = string;

export type Vigente = 0 | 1;

export type StatusImportacao = "PROCESSANDO" | "CONCLUIDO" | "PARCIAL" | "FALHOU";

export type EstadoLinhaImportacao =
  | "PENDENTE"
  | "EM_ANDAMENTO"
  | "PROCESSADO"
  | "REAPROVEITADO"
  | "FALHOU";

export interface GuiaPersistida {
  id: string;
  idGuia: string;
  importIdInicial: string;
  criadoEm: TimestampIso;
  atualizadoEm: TimestampIso;
}

export interface RevisaoPersistida {
  id: string;
  guiaId: string;
  numero: number;
  vigente: Vigente;
  entradaOriginal: unknown;
  entradaNormalizada: unknown;
  conteudoHash: string;
  assinaturaDuplicidade?: string | null;
  importId?: string | null;
  idempotencyKey?: string | null;
  criadoEm: TimestampIso;
}

export interface ValidacaoPersistida {
  id: string;
  revisaoId: string;
  sequencia: number;
  vigente: Vigente;
  decisao: "OK" | "PENDENTE";
  checagemTextual: "completa" | "incompleta" | "nao_aplicavel";
  referenciaTemporal?: string | null;
  regrasVersao: string;
  regrasHash: string;
  rulesetId: string;
  inferenciaModelo?: string | null;
  inferenciaPromptVersao?: string | null;
  orientacoes: unknown;
  limitacoes: unknown;
  extracaoId?: string | null;
  processadoEm: TimestampIso;
}

export interface ContagemLinhasImportacao {
  encontradas: number;
  pendentes: number;
  emAndamento: number;
  processadas: number;
  reaproveitadas: number;
  comFalha: number;
}

/** Metadados persistidos de um lote de importação (`imports`). */
export interface ImportacaoPersistida {
  id: string;
  idempotencyKey: string;
  arquivoNome: string;
  arquivoHash: string;
  regrasVersao: string;
  regrasHash: string;
  status: StatusImportacao;
  tamanhoChunk: number;
  linhasEncontradas: number;
  iniciadoEm: TimestampIso;
  atualizadoEm: TimestampIso;
  concluidoEm: string | null;
}

/** Linha durável de um lote (`import_lines`), inclusive colunas de posse. */
export interface LinhaImportacao {
  id: string;
  importId: string;
  numeroLinha: number;
  estado: EstadoLinhaImportacao;
  linhaOriginal: string;
  originalJson: string | null;
  guiaId: string | null;
  revisaoId: string | null;
  motivo: string | null;
  dono: string | null;
  reservadoEm: string | null;
  atualizadoEm: TimestampIso;
}

export type ResultadoTraducaoUnicidade =
  | { tipo: "unicidade"; tabela: string; colunas: string[] }
  | { tipo: "outro" };

export interface EntradaReservaVersaoGlobal {
  chave: string;
  versaoLida: number | null;
}

export interface ResultadoReservaVersaoGlobal {
  aplicado: boolean;
  versao: number | null;
}
