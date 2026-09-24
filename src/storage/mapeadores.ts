/**
 * Mapeadores linha↔objeto das tabelas de armazenamento.
 *
 * Entrada crua (coluna SQL) nunca é concatenada em SQL; aqui apenas convertemos
 * os valores devolvidos pelo D1 para os contratos tipados, decodificando as
 * colunas `*_json` e normalizando `vigente` para 0 | 1.
 */

import type { GuiaPersistida, RevisaoPersistida, ValidacaoPersistida, Vigente } from "./contratos";

export type LinhaBanco = Record<string, unknown>;

function exigirTexto(linha: LinhaBanco, coluna: string): string {
  const valor = linha[coluna];
  if (typeof valor !== "string") {
    throw new TypeError(`coluna ${coluna} deveria ser TEXT`);
  }
  return valor;
}

function textoOpcional(linha: LinhaBanco, coluna: string): string | null {
  const valor = linha[coluna];
  return valor === null || valor === undefined ? null : String(valor);
}

function exigirInteiro(linha: LinhaBanco, coluna: string): number {
  const numero = Number(linha[coluna]);
  if (!Number.isInteger(numero)) {
    throw new TypeError(`coluna ${coluna} deveria ser INTEGER`);
  }
  return numero;
}

/** Normaliza `vigente` persistido para 0 | 1; qualquer outro valor é corrupção. */
export function vigenteDaLinha(linha: LinhaBanco): Vigente {
  const valor = Number(linha.vigente);
  if (valor !== 0 && valor !== 1) {
    throw new TypeError("coluna vigente deveria ser 0 ou 1");
  }
  return valor;
}

/** Decodifica uma coluna TEXT que guarda JSON. */
export function jsonDaLinha(linha: LinhaBanco, coluna: string): unknown {
  return JSON.parse(exigirTexto(linha, coluna));
}

/** Serializa um valor para bind em coluna `*_json`. */
export function jsonParaBind(valor: unknown): string {
  return JSON.stringify(valor);
}

export function mapearGuia(linha: LinhaBanco): GuiaPersistida {
  return {
    id: exigirTexto(linha, "id"),
    idGuia: exigirTexto(linha, "id_guia"),
    importIdInicial: exigirTexto(linha, "import_id_inicial"),
    criadoEm: exigirTexto(linha, "criado_em"),
    atualizadoEm: exigirTexto(linha, "atualizado_em"),
  };
}

export function mapearRevisao(linha: LinhaBanco): RevisaoPersistida {
  return {
    id: exigirTexto(linha, "id"),
    guiaId: exigirTexto(linha, "guide_id"),
    numero: exigirInteiro(linha, "numero"),
    vigente: vigenteDaLinha(linha),
    entradaOriginal: jsonDaLinha(linha, "entrada_original_json"),
    entradaNormalizada: jsonDaLinha(linha, "entrada_normalizada_json"),
    conteudoHash: exigirTexto(linha, "conteudo_hash"),
    assinaturaDuplicidade: textoOpcional(linha, "assinatura_duplicidade"),
    importId: textoOpcional(linha, "import_id"),
    idempotencyKey: textoOpcional(linha, "idempotency_key"),
    criadoEm: exigirTexto(linha, "criado_em"),
  };
}

export function mapearValidacao(linha: LinhaBanco): ValidacaoPersistida {
  return {
    id: exigirTexto(linha, "id"),
    revisaoId: exigirTexto(linha, "revision_id"),
    sequencia: exigirInteiro(linha, "sequencia"),
    vigente: vigenteDaLinha(linha),
    decisao: exigirTexto(linha, "decisao") as ValidacaoPersistida["decisao"],
    checagemTextual: exigirTexto(
      linha,
      "checagem_textual",
    ) as ValidacaoPersistida["checagemTextual"],
    referenciaTemporal: textoOpcional(linha, "referencia_temporal"),
    regrasVersao: exigirTexto(linha, "regras_versao"),
    regrasHash: exigirTexto(linha, "regras_hash"),
    rulesetId: exigirTexto(linha, "ruleset_id"),
    inferenciaModelo: textoOpcional(linha, "inferencia_modelo"),
    inferenciaPromptVersao: textoOpcional(linha, "inferencia_prompt_versao"),
    orientacoes: jsonDaLinha(linha, "orientacoes_json"),
    limitacoes: jsonDaLinha(linha, "limitacoes_json"),
    extracaoId: textoOpcional(linha, "extracao_id"),
    processadoEm: exigirTexto(linha, "processado_em"),
  };
}
