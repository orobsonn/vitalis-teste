/**
 * Catálogo versionado de regras: validação estrita, hash SHA-256 do JSON
 * canônico e consulta normalizada por convênio/procedimento.
 *
 * O catálogo inválido nunca produz um catálogo parcial: a validação acumula
 * erros e devolve `{ ok: false, erros }`.
 */

import { textoCanonico } from "../shared/json-canonico";
import { sha256Hex } from "../shared/sha256";
import { COLUNAS_GUIA, type ColunaGuia } from "./contratos";

export const LIMITACAO_GLOBAL_DURACAO_MAXIMA = "duracao_maxima_autorizacao_nao_verificavel";

export interface ProcedimentoCatalogo {
  codigo: string;
  descricao: string;
  valorReferenciaCentavos: number;
}

export interface ConvenioCatalogo {
  nome: string;
  camposObrigatorios: ColunaGuia[];
  validadeMaximaDias: number;
  limiteSessoes: number;
  procedimentosCobertos: string[];
  prazoEnvioDias: number;
  observacao: string;
}

export interface Catalogo {
  versao: string;
  hash: string;
  regrasVersao: string;
  convenios: ConvenioCatalogo[];
  procedimentos: ProcedimentoCatalogo[];
  limitacoesGlobais: string[];
  definicoes: Record<string, string>;
}

export type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] };

export interface ConsultaRegra {
  cobertura: "coberto" | "nao_coberto" | "indefinido";
  procedimento: ProcedimentoCatalogo | null;
  camposObrigatorios: ColunaGuia[];
  validadeMaximaDias: number;
  limiteSessoes: number;
  prazoEnvioDias: number;
  observacao: string;
  limitacoes: string[];
  regrasVersao: string;
}

export function normalizarChave(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehColunaGuia(valor: string): valor is ColunaGuia {
  return (COLUNAS_GUIA as readonly string[]).includes(valor);
}

/** Dias, limites e posições do catálogo são inteiros não negativos. */
function ehInteiroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

/** Digest SHA-256 do JSON canônico (chaves ordenadas recursivamente, UTF-8). */
export function hashCatalogo(json: unknown): string {
  return sha256Hex(textoCanonico(json));
}

function lerProcedimentos(valor: unknown, erros: string[]): ProcedimentoCatalogo[] {
  if (!Array.isArray(valor)) {
    erros.push("procedimentos deve ser uma lista");
    return [];
  }
  const procedimentos: ProcedimentoCatalogo[] = [];
  valor.forEach((item, indice) => {
    if (!ehObjeto(item)) {
      erros.push(`procedimentos[${indice}] deve ser um objeto`);
      return;
    }
    const codigo = item["codigo"];
    const descricao = item["descricao"];
    const referencia = item["valor_referencia"];
    if (typeof codigo !== "string" || codigo.trim() === "") {
      erros.push(`procedimentos[${indice}].codigo deve ser um texto não vazio`);
      return;
    }
    if (typeof descricao !== "string") {
      erros.push(`procedimentos[${indice}].descricao deve ser um texto`);
      return;
    }
    if (typeof referencia !== "number" || !Number.isFinite(referencia) || referencia < 0) {
      erros.push(`procedimentos[${indice}].valor_referencia deve ser um número não negativo`);
      return;
    }
    const centavos = Math.round(referencia * 100);
    if (!Number.isSafeInteger(centavos)) {
      erros.push(`procedimentos[${indice}].valor_referencia excede o inteiro seguro em centavos`);
      return;
    }
    procedimentos.push({
      codigo,
      descricao,
      valorReferenciaCentavos: centavos,
    });
  });
  return procedimentos;
}

function lerConvenios(valor: unknown, erros: string[]): ConvenioCatalogo[] {
  if (!Array.isArray(valor)) {
    erros.push("convenios deve ser uma lista");
    return [];
  }
  const convenios: ConvenioCatalogo[] = [];
  valor.forEach((item, indice) => {
    if (!ehObjeto(item)) {
      erros.push(`convenios[${indice}] deve ser um objeto`);
      return;
    }
    const nome = item["nome"];
    const obrigatorios = item["campos_obrigatorios"];
    const validade = item["validade_maxima_autorizacao_dias"];
    const limite = item["limite_sessoes_por_autorizacao"];
    const cobertos = item["procedimentos_cobertos"];
    const prazo = item["prazo_envio_dias"];
    const observacao = item["observacao"];

    const problemas: string[] = [];
    if (typeof nome !== "string" || nome.trim() === "") {
      problemas.push("nome deve ser um texto não vazio");
    }
    if (!Array.isArray(obrigatorios) || !obrigatorios.every((campo) => typeof campo === "string")) {
      problemas.push("campos_obrigatorios deve ser uma lista de textos");
    } else if (!obrigatorios.every((campo) => ehColunaGuia(campo as string))) {
      problemas.push("campos_obrigatorios só pode conter colunas conhecidas da guia");
    }
    if (!ehInteiroNaoNegativo(validade)) {
      problemas.push("validade_maxima_autorizacao_dias deve ser um inteiro não negativo");
    }
    if (!ehInteiroNaoNegativo(limite)) {
      problemas.push("limite_sessoes_por_autorizacao deve ser um inteiro não negativo");
    }
    if (!Array.isArray(cobertos) || !cobertos.every((codigo) => typeof codigo === "string")) {
      problemas.push("procedimentos_cobertos deve ser uma lista de textos");
    }
    if (!ehInteiroNaoNegativo(prazo)) {
      problemas.push("prazo_envio_dias deve ser um inteiro não negativo");
    }
    if (typeof observacao !== "string") {
      problemas.push("observacao deve ser um texto");
    }

    if (problemas.length > 0) {
      erros.push(`convenios[${indice}]: ${problemas.join("; ")}`);
      return;
    }

    convenios.push({
      nome: nome as string,
      camposObrigatorios: [...new Set(obrigatorios as ColunaGuia[])],
      validadeMaximaDias: validade as number,
      limiteSessoes: limite as number,
      procedimentosCobertos: [...(cobertos as string[])],
      prazoEnvioDias: prazo as number,
      observacao: observacao as string,
    });
  });
  return convenios;
}

function lerDefinicoes(valor: unknown): Record<string, string> {
  if (!ehObjeto(valor)) {
    return {};
  }
  const definicoes: Record<string, string> = {};
  for (const chave of Object.keys(valor)) {
    const item = valor[chave];
    if (typeof item === "string") {
      definicoes[chave] = item;
    }
  }
  return definicoes;
}

function lerLimitacoes(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

/** Valida a estrutura e devolve o catálogo versionado, ou os erros encontrados. */
export function carregarCatalogo(json: unknown): ResultadoCatalogo {
  if (!ehObjeto(json)) {
    return { ok: false, erros: ["catalogo deve ser um objeto JSON"] };
  }

  const erros: string[] = [];
  const versao = json["versao"];
  if (typeof versao !== "string" || versao.trim() === "") {
    erros.push("versao deve ser um texto não vazio");
  }

  const procedimentos = lerProcedimentos(json["procedimentos"], erros);
  const convenios = lerConvenios(json["convenios"], erros);

  const codigosDeProcedimento = new Set<string>();
  for (const procedimento of procedimentos) {
    if (codigosDeProcedimento.has(procedimento.codigo)) {
      erros.push(`procedimentos: codigo duplicado "${procedimento.codigo}"`);
    }
    codigosDeProcedimento.add(procedimento.codigo);
  }
  const nomesDeConvenio = new Set<string>();
  for (const convenio of convenios) {
    const chave = normalizarChave(convenio.nome);
    if (nomesDeConvenio.has(chave)) {
      erros.push(`convenios: nome normalizado duplicado "${chave}"`);
    }
    nomesDeConvenio.add(chave);
    for (const codigo of convenio.procedimentosCobertos) {
      if (!codigosDeProcedimento.has(codigo)) {
        erros.push(`convenios: procedimento coberto ausente "${codigo}"`);
      }
    }
  }

  if (erros.length > 0) {
    return { ok: false, erros };
  }

  let hash: string;
  try {
    hash = hashCatalogo(json);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    erros.push(`catalogo invalido: nao foi possivel canonicalizar (${mensagem})`);
    return { ok: false, erros };
  }
  const limitacoesGlobais = [...new Set([...lerLimitacoes(json["limitacoes_globais"]), LIMITACAO_GLOBAL_DURACAO_MAXIMA])];

  return {
    ok: true,
    catalogo: {
      versao: versao as string,
      hash,
      regrasVersao: `${versao as string}#${hash}`,
      convenios,
      procedimentos,
      limitacoesGlobais,
      definicoes: lerDefinicoes(json["definicoes"]),
    },
  };
}

export function buscarConvenio(catalogo: Catalogo, nome: string): ConvenioCatalogo | null {
  const chave = normalizarChave(nome);
  if (chave === "") {
    return null;
  }
  return catalogo.convenios.find((convenio) => normalizarChave(convenio.nome) === chave) ?? null;
}

export function buscarProcedimento(catalogo: Catalogo, codigo: string): ProcedimentoCatalogo | null {
  const limpo = codigo.trim();
  if (limpo === "") {
    return null;
  }
  return catalogo.procedimentos.find((procedimento) => procedimento.codigo === limpo) ?? null;
}

export function consultarRegra(
  input: { convenio: string; procedimento_codigo: string },
  catalogo: Catalogo,
): ConsultaRegra {
  const convenio = buscarConvenio(catalogo, input.convenio);
  const procedimento = buscarProcedimento(catalogo, input.procedimento_codigo);

  let cobertura: ConsultaRegra["cobertura"] = "indefinido";
  if (convenio && procedimento) {
    cobertura = convenio.procedimentosCobertos.includes(procedimento.codigo)
      ? "coberto"
      : "nao_coberto";
  }

  return {
    cobertura,
    procedimento,
    camposObrigatorios: convenio ? [...convenio.camposObrigatorios] : [],
    validadeMaximaDias: convenio ? convenio.validadeMaximaDias : 0,
    limiteSessoes: convenio ? convenio.limiteSessoes : 0,
    prazoEnvioDias: convenio ? convenio.prazoEnvioDias : 0,
    observacao: convenio ? convenio.observacao : "",
    limitacoes: [],
    regrasVersao: catalogo.regrasVersao,
  };
}
