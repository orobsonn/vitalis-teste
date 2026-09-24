/**
 * Contratos públicos da orquestração retomável de importação.
 *
 * O progresso é derivado POR LINHA (`import_lines`), nunca de um contador
 * denormalizado, e o status do lote é sempre derivado dessas linhas. Nenhum
 * relógio de parede é lido aqui: todo instante vem do `agora` injetado.
 */

import type { Catalogo, GuiaNormalizada } from "../../domain";
import type { ConferenciaPersistivel } from "../guides";
import type { ContagemLinhasImportacao, StatusImportacao } from "../../storage";

/** Progresso do lote: exatamente a contagem durável de `import_lines`. */
export type ProgressoImportacao = ContagemLinhasImportacao;

/** Visão pública do lote: metadados persistidos + progresso derivado. */
export interface LoteImportacao {
  id: string;
  idempotencyKey: string;
  arquivoHash: string;
  regrasHash: string;
  status: StatusImportacao;
  tamanhoChunk: number;
  linhasEncontradas: number;
  progresso: ProgressoImportacao;
}

export interface OpcoesIniciarImportacao {
  csv: string;
  arquivoNome: string;
  idempotencyKey: string;
  regras: Catalogo;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
  tamanhoChunk?: number;
}

export interface OpcoesProcessarChunk {
  loteId: string;
  dono: string;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
}

export interface OpcoesContinuarImportacao {
  loteId: string;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
  tamanhoChunk?: number;
}

export interface OpcoesFinalizarLote {
  loteId: string;
  agora: string;
}

export interface ResultadoImportacaoLote {
  lote: LoteImportacao;
  progresso: ProgressoImportacao;
}
