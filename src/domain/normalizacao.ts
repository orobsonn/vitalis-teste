/**
 * Normalização preservadora das 18 células cruas e da matriz única de
 * problemas de normalização. Cada `(código, campo)` sai no máximo uma vez.
 */

import type { ColunaGuia, GuiaOriginal } from "./contratos";
import type { DataCivil } from "./datas";
import { parseDataCivil } from "./datas";
import { valorParaCentavos } from "./dinheiro";
import type { LinhaGuiaCsv } from "./csv";

export type CodigoProblema = "data_invalida" | "valor_ilegivel" | "campo_numerico_invalido";

export interface ProblemaNormalizacao {
  campo: ColunaGuia;
  codigo: CodigoProblema;
  valorOriginal: string;
}

export interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  linhaOriginal: string;
  unidade: string;
  dataAtendimento: DataCivil | null;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimentoCodigo: string;
  procedimentoDescricao: string;
  numeroAutorizacao: string;
  autorizacaoValidade: DataCivil | null;
  autorizacaoSessoesLimite: number | null;
  sessaoNumero: number | null;
  profissional: string;
  profissionalRegistro: string;
  valorCentavos: number | null;
  observacaoRecepcao: string;
  dataLancamento: DataCivil | null;
  problemas: ProblemaNormalizacao[];
}

const APENAS_INTEIROS = /^\d+$/;

/** Inteiro da gramática da guia: `^\d+$` após trim, faixa 1..10000, vazio = ausência. */
export function inteiroDaGuia(texto: string): number | null {
  const limpo = texto.trim();
  if (!APENAS_INTEIROS.test(limpo)) {
    return null;
  }
  const valor = Number.parseInt(limpo, 10);
  if (valor < 1 || valor > 10000) {
    return null;
  }
  return valor;
}

export function normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada {
  const original = linha.original;
  const problemas: ProblemaNormalizacao[] = [];

  const registrar = (campo: ColunaGuia, codigo: CodigoProblema, valorOriginal: string): void => {
    problemas.push({ campo, codigo, valorOriginal });
  };

  const lerData = (campo: ColunaGuia): DataCivil | null => {
    const cru = original[campo];
    if (cru.trim() === "") {
      return null;
    }
    const data = parseDataCivil(cru);
    if (!data) {
      registrar(campo, "data_invalida", cru);
    }
    return data;
  };

  const lerInteiro = (campo: ColunaGuia): number | null => {
    const cru = original[campo];
    if (cru.trim() === "") {
      return null;
    }
    const valor = inteiroDaGuia(cru);
    if (valor === null) {
      registrar(campo, "campo_numerico_invalido", cru);
    }
    return valor;
  };

  const dataAtendimento = lerData("data_atendimento");
  const autorizacaoValidade = lerData("autorizacao_validade");
  const dataLancamento = lerData("data_lancamento");
  const autorizacaoSessoesLimite = lerInteiro("autorizacao_sessoes_limite");
  const sessaoNumero = lerInteiro("sessao_numero_na_autorizacao");

  const valorCru = original.valor;
  const valorCentavos = valorParaCentavos(valorCru);
  if (valorCentavos === null) {
    registrar("valor", "valor_ilegivel", valorCru);
  }

  return {
    id: original.id_guia,
    original,
    linhaOriginal: linha.linhaOriginal,
    unidade: original.unidade,
    dataAtendimento,
    paciente: original.paciente,
    convenio: original.convenio,
    carteirinha: original.carteirinha,
    cid: original.cid,
    procedimentoCodigo: original.procedimento_codigo,
    procedimentoDescricao: original.procedimento_descricao,
    numeroAutorizacao: original.numero_autorizacao,
    autorizacaoValidade,
    autorizacaoSessoesLimite,
    sessaoNumero,
    profissional: original.profissional,
    profissionalRegistro: original.profissional_registro,
    valorCentavos,
    observacaoRecepcao: original.observacao_recepcao,
    dataLancamento,
    problemas,
  };
}
