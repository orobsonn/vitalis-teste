import type { Catalogo, ConsultaRegra } from "../domain/catalogo";
import type { GuiaOriginal } from "../domain/contratos";
import type { GuiaNormalizada } from "../domain/normalizacao";
import type { Motivo, ResultadoVerificacao } from "../domain/motor";
import type { RelatorioGuias } from "../reports/contratos";
import type { LoteImportacao } from "../application/imports/contratos";
import type { LinhaImportacao } from "../storage/contratos";

export type { Catalogo, ConsultaRegra, GuiaOriginal, Motivo, ResultadoVerificacao, RelatorioGuias };
export interface GuiaResumo {
  id: string;
  idGuia: string;
  original: GuiaOriginal;
  normalizada?: GuiaNormalizada;
  decisao: "OK" | "PENDENTE";
  checagemTextual: string;
  motivos: Motivo[];
  revisaoNumero: number;
  processadoEm: string;
  importId?: string | null;
  referenciaTemporal?: string | null;
  regrasVersao?: string;
  orientacoes?: string[];
  limitacoes?: string[];
  resultado?: ResultadoVerificacao;
}
export interface ValidacaoResumo {
  decisao: "OK" | "PENDENTE";
  checagemTextual: string;
  regrasVersao: string;
  referenciaTemporal: string | null;
  orientacoes: string[];
  limitacoes: string[];
  motivos: Motivo[];
  processadoEm: string;
}
export interface GuiaDetalhe {
  guia: GuiaResumo;
  revisoes: { numero: number; criadoEm: string; entradaOriginal: GuiaOriginal; validacoes: ValidacaoResumo[] }[];
}
export interface Importacao extends LoteImportacao { arquivoNome?: string; iniciadoEm?: string }
export interface ImportacaoResposta { lote: Importacao; progresso: LoteImportacao["progresso"]; linhas?: LinhaImportacao[] }
export interface DashboardResposta { estoque: RelatorioGuias; atividade?: RelatorioGuias }
export interface Sessao { user: { email: string }; csrfToken: string }

let csrfToken = "";
export function configurarSessao(sessao: Sessao) { csrfToken = sessao.csrfToken; }
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = data?.error ?? data?.erro ?? data?.message;
    throw new Error(typeof message === "string" ? message : `Não foi possível concluir a operação (${response.status}). Tente novamente.`);
  }
  return data as T;
}
export function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}
