/**
 * Mapeadores linha↔objeto das tabelas de armazenamento.
 *
 * Entrada crua (coluna SQL) nunca é concatenada em SQL; aqui apenas convertemos
 * os valores devolvidos pelo D1 para os contratos tipados, decodificando as
 * colunas `*_json` e normalizando `vigente` para 0 | 1.
 */

import type {
  EstadoLinhaImportacao,
  GuiaPersistida,
  ImportacaoPersistida,
  LinhaImportacao,
  RevisaoPersistida,
  StatusImportacao,
  ValidacaoPersistida,
  Vigente,
} from "./contratos";

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

/** Metadados do lote (`imports`) mapeados para o contrato tipado. */
export function mapearImportacao(linha: LinhaBanco): ImportacaoPersistida {
  return {
    id: exigirTexto(linha, "id"),
    idempotencyKey: exigirTexto(linha, "idempotency_key"),
    arquivoNome: exigirTexto(linha, "arquivo_nome"),
    arquivoHash: exigirTexto(linha, "arquivo_hash"),
    regrasVersao: exigirTexto(linha, "regras_versao"),
    regrasHash: exigirTexto(linha, "regras_hash"),
    status: exigirTexto(linha, "status") as StatusImportacao,
    tamanhoChunk: exigirInteiro(linha, "tamanho_chunk"),
    linhasEncontradas: exigirInteiro(linha, "linhas_encontradas"),
    iniciadoEm: exigirTexto(linha, "iniciado_em"),
    atualizadoEm: exigirTexto(linha, "atualizado_em"),
    concluidoEm: textoOpcional(linha, "concluido_em"),
  };
}

/** Linha de lote (`import_lines`) mapeada para o contrato tipado, com posse. */
export function mapearLinhaImportacao(linha: LinhaBanco): LinhaImportacao {
  return {
    id: exigirTexto(linha, "id"),
    importId: exigirTexto(linha, "import_id"),
    numeroLinha: exigirInteiro(linha, "numero_linha"),
    estado: exigirTexto(linha, "estado") as EstadoLinhaImportacao,
    linhaOriginal: exigirTexto(linha, "linha_original"),
    originalJson: textoOpcional(linha, "original_json"),
    guiaId: textoOpcional(linha, "guia_id"),
    revisaoId: textoOpcional(linha, "revisao_id"),
    motivo: textoOpcional(linha, "motivo"),
    dono: textoOpcional(linha, "dono"),
    reservadoEm: textoOpcional(linha, "reservado_em"),
    atualizadoEm: exigirTexto(linha, "atualizado_em"),
  };
}
