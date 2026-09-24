/**
 * Cálculos puros da conferência de guias: hash de conteúdo, assinatura de
 * duplicidade de nove campos e motivo de overlay.
 *
 * Tudo aqui é determinístico e independente de ordem, relógio e `id_guia`; a
 * data de atendimento inválida nunca produz assinatura (J2) e a evidência do
 * overlay deriva da assinatura curta mais a cardinalidade do grupo (J4).
 */

import { COLUNAS_GUIA, dataParaIso, normalizarChave } from "../../domain";
import type { GuiaNormalizada, Motivo } from "../../domain";
import { sha256Hex } from "../../shared/sha256";
import type { ConteudoValidacao } from "./contratos";

export const CODIGO_DUPLICIDADE = "duplicidade_grupo_candidato";

/** Os nove campos da assinatura, na ordem canônica fixa. */
export const CAMPOS_ASSINATURA: readonly string[] = [
  "convenio",
  "paciente",
  "carteirinha",
  "numero_autorizacao",
  "data_atendimento",
  "procedimento_codigo",
  "sessao_numero_na_autorizacao",
  "unidade",
  "profissional_registro",
];

/** Textos versionados do overlay de duplicidade (constantes, nunca livres). */
export const REGRA_DUPLICIDADE =
  "Duplicidade candidata (v1): guias com a mesma assinatura normalizada de nove campos.";
export const ORIENTACAO_DUPLICIDADE =
  "Confirme se as guias repetem o mesmo atendimento antes do envio; " +
  "não descarte nem una os lançamentos sem conferência humana.";

/**
 * Digest do conteúdo das 18 células cruas, incluindo `id_guia`. Determinístico
 * e sensível a qualquer alteração de conteúdo; nunca participa da decisão.
 */
export function conteudoHashDaGuia(guia: GuiaNormalizada): string {
  const celulas = COLUNAS_GUIA.map((coluna) => guia.original[coluna]);
  // Codificação injetiva sobre todas as strings JS: o array JSON canônico
  // escapa fronteiras e NUL internos, e o `JSON.stringify` bem-formado
  // (ES2019+) serializa surrogate isolado como `\ud800` ASCII, impedindo a
  // colisão com U+FFFD introduzida por `codificarUtf8`.
  return sha256Hex(JSON.stringify(celulas));
}

/** Representação textual canônica da posição da sessão (ausência = vazio). */
function sessaoCanonica(sessao: number | null): string {
  return sessao === null ? "" : String(sessao);
}

/**
 * Assinatura dos nove campos normalizados, ou `null` quando a data de
 * atendimento é inválida/ausente (J2).
 */
export function assinaturaDuplicidadeDaGuia(guia: GuiaNormalizada): string | null {
  if (guia.dataAtendimento === null) {
    return null;
  }
  const campos = [
    normalizarChave(guia.convenio),
    normalizarChave(guia.paciente),
    normalizarChave(guia.carteirinha),
    normalizarChave(guia.numeroAutorizacao),
    dataParaIso(guia.dataAtendimento),
    normalizarChave(guia.procedimentoCodigo),
    sessaoCanonica(guia.sessaoNumero),
    normalizarChave(guia.unidade),
    normalizarChave(guia.profissionalRegistro),
  ];
  return sha256Hex(campos.join("\u0000"));
}

/** Motivo de overlay determinístico: assinatura curta + cardinalidade, sem id_guia. */
export function overlayDuplicidade(assinatura: string, cardinalidade: number): Motivo {
  return {
    codigo: CODIGO_DUPLICIDADE,
    severidade: "pendencia",
    campos: [...CAMPOS_ASSINATURA],
    regra: REGRA_DUPLICIDADE,
    evidencia: `Assinatura ${assinatura.slice(0, 12)} compartilhada por ${cardinalidade} revisões vigentes.`,
    orientacao: ORIENTACAO_DUPLICIDADE,
  };
}

/** Extrai o overlay persistido de uma lista de findings, se houver. */
export function extrairOverlay(motivos: readonly Motivo[]): Motivo | null {
  return motivos.find((motivo) => motivo.codigo === CODIGO_DUPLICIDADE) ?? null;
}

/** Conteúdo canônico de uma validação, usado no id determinístico (J10). */
export function conteudoDaValidacao(conteudo: ConteudoValidacao): string {
  return [
    conteudo.decisao,
    conteudo.checagemTextual,
    conteudo.referenciaTemporal ?? "",
    conteudo.regrasVersao,
    conteudo.regrasHash,
    conteudo.rulesetId,
    conteudo.inferenciaModelo ?? "",
    conteudo.inferenciaPromptVersao ?? "",
    JSON.stringify(conteudo.orientacoes),
    JSON.stringify(conteudo.limitacoes),
    conteudo.extracaoId ?? "",
    conteudo.processadoEm,
  ].join("\u0000");
}
