/**
 * Motor determinístico de verificação de uma guia contra o catálogo validado.
 *
 * Nenhuma decisão usa `id_guia`, relógio de parede, fuso horário ou locale. A
 * única referência temporal é a fornecida por opção ou a `data_lancamento`
 * válida; sem ambas, o prazo é explicitamente não verificável.
 */

import type { ColunaGuia } from "./contratos";
import type { ConvenioCatalogo, ProcedimentoCatalogo } from "./catalogo";
import { buscarConvenio, buscarProcedimento, normalizarChave, type Catalogo } from "./catalogo";
import type { DataCivil } from "./datas";
import { compararData, dataParaIso, somarDias } from "./datas";
import { formatarCentavos } from "./dinheiro";
import type { GuiaNormalizada } from "./normalizacao";

export type SeveridadeMotivo = "pendencia" | "alerta";

export interface Motivo {
  codigo: string;
  severidade: SeveridadeMotivo;
  campos: string[];
  regra: string;
  evidencia: string;
  orientacao: string;
}

export interface ResultadoVerificacao {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string | null;
  regras_versao: string;
}

/** Ordem fixa de pipeline dos motivos; garante saída determinística. */
const ORDEM_CODIGOS: readonly string[] = [
  "convenio_ausente",
  "convenio_nao_catalogado",
  "procedimento_ausente",
  "procedimento_nao_catalogado",
  "procedimento_sem_cobertura",
  "procedimento_descricao_divergente",
  "campo_obrigatorio_ausente",
  "data_invalida",
  "campo_numerico_invalido",
  "valor_ilegivel",
  "profissional_registro_invalido",
  "autorizacao_vencida",
  "sessao_acima_do_limite",
  "prazo_envio_excedido",
  "cronologia_incoerente",
  "valor_divergente_da_referencia",
];

interface TextoCanonico {
  regra: string;
  orientacao: string;
}

const TEXTOS: Record<string, TextoCanonico> = {
  convenio_ausente: {
    regra: "O convênio é obrigatório para localizar a regra aplicável.",
    orientacao: "Informe o convênio da guia para localizar a regra aplicável.",
  },
  convenio_nao_catalogado: {
    regra: "O convênio deve existir no catálogo versionado.",
    orientacao: "Confira o convênio: o nome não existe no catálogo versionado.",
  },
  procedimento_ausente: {
    regra: "O código do procedimento é obrigatório para localizar a cobertura.",
    orientacao: "Informe o código do procedimento realizado.",
  },
  procedimento_nao_catalogado: {
    regra: "O procedimento deve existir no catálogo versionado.",
    orientacao: "Confira o procedimento: o código não existe no catálogo versionado.",
  },
  procedimento_sem_cobertura: {
    regra: "O procedimento deve constar na lista de procedimentos cobertos do convênio.",
    orientacao:
      "Confirme a cobertura do procedimento com o convênio ou registre a guia como particular.",
  },
  procedimento_descricao_divergente: {
    regra: "A descrição da guia deve corresponder à descrição do procedimento no catálogo.",
    orientacao: "Alinhe a descrição da guia com o procedimento do catálogo.",
  },
  campo_obrigatorio_ausente: {
    regra: "O campo é obrigatório para o convênio da guia.",
    orientacao: "Preencha o campo obrigatório do convênio antes do envio.",
  },
  data_invalida: {
    regra: "A data deve existir no calendário real, em DD/MM/AAAA ou AAAA-MM-DD.",
    orientacao: "Corrija a data para o formato DD/MM/AAAA ou AAAA-MM-DD.",
  },
  campo_numerico_invalido: {
    regra: "O campo aceita apenas inteiros de 1 a 10000, com zeros à esquerda permitidos.",
    orientacao: "Corrija o campo para um inteiro entre 1 e 10000.",
  },
  valor_ilegivel: {
    regra: "O valor deve ser um número em reais com até duas casas decimais.",
    orientacao: "Corrija o valor da guia para um número em reais com até duas casas decimais.",
  },
  profissional_registro_invalido: {
    regra: "O registro deve seguir o formato CREFITO-n NNNNNN-F ou CRM-UF NNNNNN.",
    orientacao: "Corrija o registro profissional para o formato CREFITO-n NNNNNN-F ou CRM-UF NNNNNN.",
  },
  autorizacao_vencida: {
    regra:
      "A validade da autorização é inclusiva e não pode terminar antes da data do atendimento.",
    orientacao: "Atualize a autorização: a validade termina antes da data do atendimento.",
  },
  sessao_acima_do_limite: {
    regra:
      "A posição da sessão não pode passar do menor limite aplicável entre autorização e convênio.",
    orientacao:
      "Confirme a autorização ou divida o excedente: a posição da sessão passa do limite aplicável.",
  },
  prazo_envio_excedido: {
    regra: "O prazo do convênio é contado da data do atendimento e o último dia é inclusivo.",
    orientacao: "Envie a guia dentro do prazo do convênio contado da data do atendimento.",
  },
  cronologia_incoerente: {
    regra: "A data de lançamento não pode ser anterior à data do atendimento.",
    orientacao: "Confira as datas: o lançamento não pode anteceder o atendimento.",
  },
  valor_divergente_da_referencia: {
    regra: "O valor lançado deve coincidir com a referência do procedimento; divergência é informativa.",
    orientacao: "Confira a diferença entre o valor lançado e a referência do procedimento.",
  },
};

const REGISTRO_ESPERADO: readonly RegExp[] = [/^CREFITO-\d{1,2} \d{4,7}-F$/, /^CRM-[A-Z]{2} \d{4,7}$/];

function registroValido(texto: string): boolean {
  const normalizado = texto.trim().replace(/\s+/g, " ").toUpperCase();
  return REGISTRO_ESPERADO.some((padrao) => padrao.test(normalizado));
}

function cru(guia: GuiaNormalizada, campo: ColunaGuia): string {
  const valor: string | undefined = guia.original[campo];
  return typeof valor === "string" ? valor : "";
}

export function verificarGuia(
  guia: GuiaNormalizada,
  catalogo: Catalogo,
  opcoes?: { referenciaTemporal?: DataCivil },
): ResultadoVerificacao {
  const motivos: Motivo[] = [];
  const limitacoes: string[] = [];

  const adicionarLimitacao = (codigo: string): void => {
    if (!limitacoes.includes(codigo)) {
      limitacoes.push(codigo);
    }
  };

  const criarMotivo = (
    codigo: string,
    severidade: SeveridadeMotivo,
    campos: readonly string[],
    evidencia: string,
    regraPersonalizada?: string,
  ): void => {
    const texto = TEXTOS[codigo]!;
    motivos.push({
      codigo,
      severidade,
      campos: [...campos].sort(),
      regra: regraPersonalizada ?? texto.regra,
      evidencia,
      orientacao: texto.orientacao,
    });
  };

  // 1. Problemas de normalização já são, cada um, o único motivo do seu campo.
  for (const problema of guia.problemas) {
    const evidencia = `Valor original "${problema.valorOriginal}" no campo ${problema.campo}.`;
    criarMotivo(problema.codigo, "pendencia", [problema.campo], evidencia);
  }
  if (guia.valorCentavos === null) {
    adicionarLimitacao("valor_fora_das_somas");
  }

  // 2. Catálogo: convênio e procedimento.
  const convenio: ConvenioCatalogo | null =
    guia.convenio.trim() === "" ? null : buscarConvenio(catalogo, guia.convenio);
  const procedimento: ProcedimentoCatalogo | null =
    guia.procedimentoCodigo.trim() === "" ? null : buscarProcedimento(catalogo, guia.procedimentoCodigo);

  if (guia.convenio.trim() === "") {
    criarMotivo("convenio_ausente", "pendencia", ["convenio"], "O convênio da guia está vazio.");
  } else if (!convenio) {
    criarMotivo(
      "convenio_nao_catalogado",
      "pendencia",
      ["convenio"],
      `O convênio "${guia.convenio}" não consta no catálogo.`,
    );
  }

  if (guia.procedimentoCodigo.trim() === "") {
    criarMotivo(
      "procedimento_ausente",
      "pendencia",
      ["procedimento_codigo"],
      "O código do procedimento está vazio.",
    );
  } else if (!procedimento) {
    criarMotivo(
      "procedimento_nao_catalogado",
      "pendencia",
      ["procedimento_codigo"],
      `O procedimento "${guia.procedimentoCodigo}" não consta no catálogo.`,
    );
  }

  if (!convenio || !procedimento) {
    adicionarLimitacao("cobertura_indefinida");
  }

  if (convenio && procedimento) {
    if (!convenio.procedimentosCobertos.includes(procedimento.codigo)) {
      criarMotivo(
        "procedimento_sem_cobertura",
        "pendencia",
        ["procedimento_codigo"],
        `O procedimento ${procedimento.codigo} não está na cobertura do convênio ${convenio.nome}.`,
      );
    }
    if (
      guia.procedimentoDescricao.trim() !== "" &&
      normalizarChave(guia.procedimentoDescricao) !== normalizarChave(procedimento.descricao)
    ) {
      criarMotivo(
        "procedimento_descricao_divergente",
        "pendencia",
        ["procedimento_codigo", "procedimento_descricao"],
        `Guia: "${guia.procedimentoDescricao}"; catálogo: "${procedimento.descricao}".`,
      );
    }
  }

  // 3. Campos obrigatórios do convênio ausentes (um motivo por campo).
  if (convenio) {
    const ausentes = convenio.camposObrigatorios
      .filter((campo) => cru(guia, campo as ColunaGuia).trim() === "")
      .sort();
    for (const campo of ausentes) {
      criarMotivo(
        "campo_obrigatorio_ausente",
        "pendencia",
        [campo],
        `O campo "${campo}" está vazio e é obrigatório para o convênio ${convenio.nome}.`,
        `O campo "${campo}" é obrigatório para o convênio ${convenio.nome}.`,
      );
    }
  }

  // 4. Registro profissional: só quando preenchido; vazio é ausência obrigatória.
  if (guia.profissionalRegistro.trim() !== "" && !registroValido(guia.profissionalRegistro)) {
    criarMotivo(
      "profissional_registro_invalido",
      "pendencia",
      ["profissional_registro"],
      `Registro "${guia.profissionalRegistro}" fora do formato mínimo.`,
    );
  }

  // 5. Validade inclusiva da autorização.
  if (guia.dataAtendimento && guia.autorizacaoValidade) {
    if (compararData(guia.autorizacaoValidade, guia.dataAtendimento) < 0) {
      criarMotivo(
        "autorizacao_vencida",
        "pendencia",
        ["autorizacao_validade", "data_atendimento"],
        `Validade ${dataParaIso(guia.autorizacaoValidade)} anterior ao atendimento ${dataParaIso(guia.dataAtendimento)}.`,
      );
    }
  }

  // 6. Menor limite aplicável e posição da sessão.
  const limiteGuiaCru = cru(guia, "autorizacao_sessoes_limite");
  const sessaoCru = cru(guia, "sessao_numero_na_autorizacao");
  const limiteInvalido = guia.autorizacaoSessoesLimite === null && limiteGuiaCru.trim() !== "";
  const sessaoInvalida = guia.sessaoNumero === null && sessaoCru.trim() !== "";

  if (sessaoInvalida) {
    adicionarLimitacao("sessao_nao_verificavel");
  } else if (limiteInvalido) {
    adicionarLimitacao("limite_sessoes_nao_verificavel");
  } else {
    const candidatos: number[] = [];
    if (guia.autorizacaoSessoesLimite !== null) {
      candidatos.push(guia.autorizacaoSessoesLimite);
    }
    if (convenio) {
      candidatos.push(convenio.limiteSessoes);
    }
    if (candidatos.length === 0) {
      adicionarLimitacao("limite_sessoes_nao_verificavel");
    } else if (guia.sessaoNumero === null) {
      adicionarLimitacao("sessao_nao_verificavel");
    } else {
      const limite = Math.min(...candidatos);
      if (guia.sessaoNumero > limite) {
        criarMotivo(
          "sessao_acima_do_limite",
          "pendencia",
          ["sessao_numero_na_autorizacao", "autorizacao_sessoes_limite"],
          `Posição ${guia.sessaoNumero} excede o menor limite aplicável (${limite}).`,
        );
      }
    }
  }

  // 7. Referência temporal totalizada: override > lançamento válido > null.
  const referencia = opcoes?.referenciaTemporal ?? guia.dataLancamento;
  if (!referencia) {
    adicionarLimitacao("prazo_nao_verificavel");
  } else if (!guia.dataAtendimento || !convenio) {
    adicionarLimitacao("prazo_nao_verificavel");
  } else {
    const dataLimite = somarDias(guia.dataAtendimento, convenio.prazoEnvioDias);
    if (compararData(referencia, dataLimite) > 0) {
      criarMotivo(
        "prazo_envio_excedido",
        "pendencia",
        ["data_atendimento", "data_lancamento"],
        `Referência ${dataParaIso(referencia)} após o dia limite ${dataParaIso(dataLimite)}.`,
      );
    }
  }

  // 8. Cronologia: sempre compara o lançamento real ao atendimento.
  if (
    guia.dataLancamento &&
    guia.dataAtendimento &&
    compararData(guia.dataLancamento, guia.dataAtendimento) < 0
  ) {
    criarMotivo(
      "cronologia_incoerente",
      "pendencia",
      ["data_lancamento", "data_atendimento"],
      `Lançamento ${dataParaIso(guia.dataLancamento)} anterior ao atendimento ${dataParaIso(guia.dataAtendimento)}.`,
    );
  }

  // 9. Valor divergente da referência: alerta informativo.
  if (procedimento && guia.valorCentavos !== null && guia.valorCentavos !== procedimento.valorReferenciaCentavos) {
    const diferenca = guia.valorCentavos - procedimento.valorReferenciaCentavos;
    criarMotivo(
      "valor_divergente_da_referencia",
      "alerta",
      ["valor"],
      `Lançado ${formatarCentavos(guia.valorCentavos)} contra referência ${formatarCentavos(procedimento.valorReferenciaCentavos)} (diferença ${formatarCentavos(diferenca)}).`,
    );
  }

  motivos.sort((primeiro, segundo) => {
    const ordemPrimeiro = ORDEM_CODIGOS.indexOf(primeiro.codigo);
    const ordemSegundo = ORDEM_CODIGOS.indexOf(segundo.codigo);
    if (ordemPrimeiro !== ordemSegundo) {
      return ordemPrimeiro - ordemSegundo;
    }
    const campoPrimeiro = primeiro.campos[0] ?? "";
    const campoSegundo = segundo.campos[0] ?? "";
    if (campoPrimeiro !== campoSegundo) {
      return campoPrimeiro < campoSegundo ? -1 : 1;
    }
    return 0;
  });

  const decisao: ResultadoVerificacao["decisao"] = motivos.some(
    (motivo) => motivo.severidade === "pendencia",
  )
    ? "PENDENTE"
    : "OK";

  const orientacoes: string[] = [];
  for (const motivo of motivos) {
    if (motivo.severidade === "pendencia" && !orientacoes.includes(motivo.orientacao)) {
      orientacoes.push(motivo.orientacao);
    }
  }

  return {
    decisao,
    motivos,
    orientacoes,
    limitacoes,
    checagem_textual: "nao_aplicavel",
    referencia_temporal: referencia ? dataParaIso(referencia) : null,
    regras_versao: catalogo.regrasVersao,
  };
}
