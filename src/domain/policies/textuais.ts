/**
 * Políticas determinísticas dos sinais textuais validados (§3.5/§3.6).
 *
 * `aplicarPoliticasTextuais` é pura: sem I/O, sem relógio, sem `id_guia`, sem
 * locale e sem aleatoriedade. Ela não decide `OK`/`PENDENTE`, não muta o
 * argumento e nunca devolve texto livre do modelo: cada `regra`/`orientacao` é
 * uma constante TypeScript; só a `evidencia` é a citação literal do sinal.
 */

import type { Ambiguidade, SinaisObservacao, TipoAmbiguidade } from "./contratos";
import type { Motivo } from "../motor";

/** Extração textual validada, já após schema, evidência e coerência. */
export interface TextualValidado {
  estado: "completa" | "incompleta";
  sinais: SinaisObservacao | null;
  modelo: string | null;
  prompt_versao: string | null;
}

/** Efeito determinístico da política, antes da ordenação do motor. */
export interface PoliticasTextuais {
  motivos: Motivo[];
  limitacoes: string[];
  estado: "completa" | "incompleta";
}

interface EfeitoSinal {
  codigo: string;
  campos: readonly string[];
  regra: string;
  orientacao: string;
  limitacao?: string;
}

/**
 * Sinais materiais, na ordem fixa em que entram em `ORDEM_CODIGOS` (§3.5):
 * `decisao_por_particular` produz o código `modalidade_particular_contraditoria`.
 * `reagendamento_mencionado`, `nota_administrativa`, `pedido_de_recibo` e
 * `pergunta_sobre_preco_particular` não têm efeito (nem pendência nem alerta).
 */
const EFEITOS_MATERIAIS: Record<string, EfeitoSinal> = {
  autorizacao_nova_nao_cadastrada: {
    codigo: "autorizacao_nova_nao_cadastrada",
    campos: ["autorizacao_validade", "numero_autorizacao"],
    regra:
      "Uma autorização nova ainda não cadastrada exige atualizar os campos formais da guia.",
    orientacao:
      "Atualize o número, a validade e os demais campos formais a partir do documento da autorização; " +
      "o texto não substitui os dados estruturados nem libera a guia.",
  },
  autorizacao_verbal_sem_numero: {
    codigo: "autorizacao_verbal_sem_numero",
    campos: ["numero_autorizacao"],
    regra:
      "A autorização deve constar com número formal; o protocolo do contato telefônico não é o número da autorização.",
    orientacao:
      "Registre o número formal da autorização antes do envio; " +
      "o protocolo não substitui o campo numero_autorizacao.",
    limitacao: "prazo_autorizacao_verbal_nao_calculado",
  },
  decisao_por_particular: {
    codigo: "modalidade_particular_contraditoria",
    campos: ["convenio"],
    regra:
      "A modalidade registrada na guia deve ser coerente com a decisão de atendimento documentada.",
    orientacao:
      "Corrija a modalidade da guia antes do envio; " +
      "a solução não converte a cobrança nem registra preço particular sem decisão formal.",
  },
  procedimento_realizado_divergente: {
    codigo: "procedimento_realizado_divergente",
    campos: ["procedimento_codigo"],
    regra: "O procedimento realizado deve conferir com o código registrado na guia.",
    orientacao:
      "Encaminhe para conferência humana preservando as duas versões; " +
      "nenhum código substituto deve ser escolhido ou gravado automaticamente.",
  },
};

/** Ordem fixa dos sinais materiais; garante saída determinística. */
const ORDEM_SINAIS_MATERIAIS: readonly string[] = [
  "autorizacao_nova_nao_cadastrada",
  "autorizacao_verbal_sem_numero",
  "decisao_por_particular",
  "procedimento_realizado_divergente",
];

/** Textos canônicos da conferência humana específica, fixos por tipo de ambiguidade. */
const TEXTOS_CONFERENCIA: Record<TipoAmbiguidade, { regra: string; orientacao: string }> = {
  autorizacao_indefinida: {
    regra: "A situação da autorização da guia está indefinida na observação.",
    orientacao:
      "Confirme com a operadora se a autorização da guia é nova, verbal ou já consta no sistema.",
  },
  modalidade_indefinida: {
    regra: "A modalidade de atendimento da guia está indefinida na observação.",
    orientacao: "Confirme com a recepção se a guia será faturada pelo convênio ou como particular.",
  },
  procedimento_indefinido: {
    regra: "O procedimento realizado está indefinido na observação.",
    orientacao: "Confirme com a unidade qual procedimento foi de fato realizado.",
  },
  outro_material: {
    regra: "Há um detalhe material a esclarecer na observação antes da conferência.",
    orientacao: "Encaminhe o caso para conferência humana antes do envio da guia.",
  },
};

const CAMPOS_CONFERENCIA: readonly string[] = ["observacao_recepcao"];
const TEXTO_INCOMPLETA = {
  codigo: "checagem_textual_incompleta",
  campos: ["observacao_recepcao"],
  regra: "A observação da guia não pôde ser interpretada de forma confiável.",
  orientacao:
    "Revise a observação da guia manualmente antes do envio: a checagem textual não foi concluída.",
  evidencia: "A checagem textual da observação não foi concluída.",
};

function criarMotivo(
  codigo: string,
  campos: readonly string[],
  regra: string,
  evidencia: string,
  orientacao: string,
): Motivo {
  return {
    codigo,
    severidade: "pendencia",
    campos: [...campos].sort(),
    regra,
    evidencia,
    orientacao,
  };
}

function conferencia(ambiguidade: Ambiguidade): Motivo {
  const texto = TEXTOS_CONFERENCIA[ambiguidade.tipo];
  return criarMotivo(
    "conferencia_humana_especifica",
    CAMPOS_CONFERENCIA,
    texto.regra,
    ambiguidade.evidencia,
    texto.orientacao,
  );
}

/**
 * Aplica as políticas textuais de §3.5/§3.6 sem decidir `OK`/`PENDENTE`.
 *
 * Ordem fixa dos motivos: sinais materiais na ordem de `ORDEM_SINAIS_MATERIAIS`,
 * depois uma `conferencia_humana_especifica` por ambiguidade na ordem recebida e,
 * por último, `checagem_textual_incompleta` quando `estado === "incompleta"`.
 */
export function aplicarPoliticasTextuais(textual: TextualValidado): PoliticasTextuais {
  const motivos: Motivo[] = [];
  const limitacoes: string[] = [];

  const adicionarLimitacao = (codigo: string): void => {
    if (!limitacoes.includes(codigo)) {
      limitacoes.push(codigo);
    }
  };

  const sinais = textual.sinais;
  if (sinais) {
    for (const tipo of ORDEM_SINAIS_MATERIAIS) {
      const efeito = EFEITOS_MATERIAIS[tipo]!;
      for (const sinal of sinais.sinais) {
        if (sinal.tipo !== tipo) {
          continue;
        }
        motivos.push(
          criarMotivo(efeito.codigo, efeito.campos, efeito.regra, sinal.evidencia, efeito.orientacao),
        );
        if (efeito.limitacao) {
          adicionarLimitacao(efeito.limitacao);
        }
      }
    }

    for (const ambiguidade of sinais.ambiguidades) {
      motivos.push(conferencia(ambiguidade));
    }
  }

  if (textual.estado === "incompleta") {
    motivos.push(
      criarMotivo(
        TEXTO_INCOMPLETA.codigo,
        TEXTO_INCOMPLETA.campos,
        TEXTO_INCOMPLETA.regra,
        TEXTO_INCOMPLETA.evidencia,
        TEXTO_INCOMPLETA.orientacao,
      ),
    );
    adicionarLimitacao("checagem_textual_incompleta");
  }

  return { motivos, limitacoes, estado: textual.estado };
}
