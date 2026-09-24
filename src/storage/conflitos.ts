/**
 * Tradução restrita de conflito de unicidade.
 *
 * Somente a mensagem canônica do SQLite/D1
 * `UNIQUE constraint failed: tabela.coluna[, tabela.coluna]` é traduzida.
 * FK, CHECK, `TypeError` e qualquer erro desconhecido permanecem `outro` —
 * nunca são promovidos a conflito de unicidade.
 */

import type { ResultadoTraducaoUnicidade } from "./contratos";

const PREFIXO_UNICIDADE = "UNIQUE constraint failed: ";

// Frase de falha de constraint que, aparecendo ANTES do prefixo de unicidade,
// indica mensagem composta (ex.: FK seguida de UNIQUE) e não um conflito puro.
const OUTRA_FALHA_DE_CONSTRAINT = "constraint failed";

// Cada item da lista canônica deve ser exatamente `tabela.coluna`, sem texto
// extra, `;`, espaços internos, parênteses, colchetes ou palavras-chave.
const IDENTIFICADOR_COLUNA = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

function mensagemDe(erro: unknown): string | null {
  if (erro instanceof Error) {
    return erro.message;
  }
  if (typeof erro === "string") {
    return erro;
  }
  if (typeof erro === "object" && erro !== null && "message" in erro) {
    const mensagem = (erro as { message?: unknown }).message;
    if (typeof mensagem === "string") {
      return mensagem;
    }
  }
  return null;
}

export function traduzirConflitoUnicidade(erro: unknown): ResultadoTraducaoUnicidade {
  const mensagem = mensagemDe(erro);
  if (mensagem === null) {
    return { tipo: "outro" };
  }

  const inicio = mensagem.indexOf(PREFIXO_UNICIDADE);
  if (inicio === -1) {
    return { tipo: "outro" };
  }

  // Toleramos o prefixo do D1 (não exigimos início absoluto), mas se houver
  // outra falha de constraint antes da unicidade a mensagem é composta.
  if (mensagem.slice(0, inicio).includes(OUTRA_FALHA_DE_CONSTRAINT)) {
    return { tipo: "outro" };
  }

  const lista = mensagem.slice(inicio + PREFIXO_UNICIDADE.length).trim();
  if (lista.length === 0) {
    return { tipo: "outro" };
  }

  const partes = lista
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
  if (partes.length === 0) {
    return { tipo: "outro" };
  }

  for (const parte of partes) {
    if (!IDENTIFICADOR_COLUNA.test(parte)) {
      return { tipo: "outro" };
    }
  }

  const tabela = partes[0]!.slice(0, partes[0]!.lastIndexOf("."));
  const colunas: string[] = [];
  for (const parte of partes) {
    const separador = parte.lastIndexOf(".");
    if (separador <= 0) {
      return { tipo: "outro" };
    }
    if (parte.slice(0, separador) !== tabela) {
      return { tipo: "outro" };
    }
    colunas.push(parte.slice(separador + 1));
  }

  if (tabela.length === 0 || colunas.some((coluna) => coluna.length === 0)) {
    return { tipo: "outro" };
  }

  return { tipo: "unicidade", tabela, colunas };
}
