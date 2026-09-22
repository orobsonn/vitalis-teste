// Teste travado lt-agregacao-valores — agregação sem dupla contagem e
// totalIncompleto.
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097). O módulo é tratado como `ApiAprovada`,
// interface local. RED por asserção de superfície/comportamento.
import { describe, expect, it } from "vitest";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

interface GuiaOriginal {
  id_guia: string;
  unidade: string;
  data_atendimento: string;
  paciente: string;
  convenio: string;
  carteirinha: string;
  cid: string;
  procedimento_codigo: string;
  procedimento_descricao: string;
  numero_autorizacao: string;
  autorizacao_validade: string;
  autorizacao_sessoes_limite: string;
  sessao_numero_na_autorizacao: string;
  profissional: string;
  profissional_registro: string;
  valor: string;
  observacao_recepcao: string;
  data_lancamento: string;
}

interface LinhaGuiaCsv {
  numero: number;
  original: GuiaOriginal;
  linhaOriginal: string;
}

interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  valorCentavos: number | null;
  problemas: Array<{ campo: string; codigo: string; valorOriginal: string }>;
}

interface Motivo {
  codigo: string;
  severidade: "pendencia" | "alerta";
  campos: string[];
  regra: string;
  evidencia: string;
  orientacao: string;
}

interface ResultadoVerificacao {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string | null;
  regras_versao: string;
}

interface Catalogo {
  versao: string;
  hash: string;
  regrasVersao: string;
  convenios: unknown[];
  procedimentos: unknown[];
  limitacoesGlobais: string[];
}

type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] };

interface AgregacaoCorpus {
  ocorrencias: number;
  guiasComPendencia: number;
  valorAssociadoCentavos: number;
  porCodigo: Record<string, number>;
  camposObrigatoriosAusentes: Record<string, number>;
  totalIncompleto: boolean;
  limitacoesGlobais: string[];
}

interface Entrada {
  guia: GuiaNormalizada;
  resultado: ResultadoVerificacao;
}

interface ApiAprovada {
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
  verificarGuia(
    guia: GuiaNormalizada,
    catalogo: Catalogo,
    opcoes?: { referenciaTemporal?: DataCivil },
  ): ResultadoVerificacao;
  agregarVerificacoes(entradas: Entrada[]): AgregacaoCorpus;
}

const COLUNAS = [
  "id_guia",
  "unidade",
  "data_atendimento",
  "paciente",
  "convenio",
  "carteirinha",
  "cid",
  "procedimento_codigo",
  "procedimento_descricao",
  "numero_autorizacao",
  "autorizacao_validade",
  "autorizacao_sessoes_limite",
  "sessao_numero_na_autorizacao",
  "profissional",
  "profissional_registro",
  "valor",
  "observacao_recepcao",
  "data_lancamento",
] as const;

type Coluna = (typeof COLUNAS)[number];

const CATALOGO_JSON = {
  versao: "agosto/2026",
  definicoes: {},
  procedimentos: [
    {
      codigo: "50000470",
      descricao: "Sessão de fisioterapia musculoesquelética",
      valor_referencia: 62.0,
    },
  ],
  convenios: [
    {
      nome: "Vitalcard",
      campos_obrigatorios: [
        "numero_autorizacao",
        "autorizacao_validade",
        "profissional_registro",
        "carteirinha",
        "cid",
      ],
      validade_maxima_autorizacao_dias: 30,
      limite_sessoes_por_autorizacao: 10,
      procedimentos_cobertos: ["50000470"],
      prazo_envio_dias: 30,
      observacao: "Reavaliação médica obrigatória a cada 10 sessões.",
    },
  ],
};

const REFERENCIA: DataCivil = { ano: 2026, mes: 8, dia: 11 };

function catalogo(): Catalogo {
  const resultado = api.carregarCatalogo(CATALOGO_JSON);
  if (!resultado.ok) {
    throw new Error(`catálogo sintético deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function linhaBase(overrides: Partial<Record<Coluna, string>> = {}): LinhaGuiaCsv {
  const base: Record<Coluna, string> = {
    id_guia: "SYN-AGG-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9300",
    convenio: "Vitalcard",
    carteirinha: "123456",
    cid: "M79.7",
    procedimento_codigo: "50000470",
    procedimento_descricao: "Sessão de fisioterapia musculoesquelética",
    numero_autorizacao: "AUT930001",
    autorizacao_validade: "2026-08-20",
    autorizacao_sessoes_limite: "10",
    sessao_numero_na_autorizacao: "3",
    profissional: "Profissional Teste",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "62,00",
    observacao_recepcao: "",
    data_lancamento: "2026-08-11",
  };
  const original = { ...base, ...overrides };
  return {
    numero: 1,
    original,
    linhaOriginal: COLUNAS.map((coluna) => original[coluna]).join(","),
  };
}

function entrada(overrides: Partial<Record<Coluna, string>> = {}): Entrada {
  const guia = api.normalizarGuia(linhaBase(overrides));
  const resultado = api.verificarGuia(guia, catalogo(), { referenciaTemporal: REFERENCIA });
  return { guia, resultado };
}

describe("agregarVerificacoes", () => {
  it("conta cada guia pendente uma vez, inclui 6200 uma vez e exclui alerta e nulo", () => {
    expect(typeof api.agregarVerificacoes).toBe("function");

    // Guia A: 6200 centavos com dois motivos de pendência.
    const guiaA = entrada({ autorizacao_validade: "2026-08-09", sessao_numero_na_autorizacao: "11" });
    expect(guiaA.resultado.motivos.filter((motivo) => motivo.severidade === "pendencia")).toHaveLength(
      2,
    );
    expect(guiaA.guia.valorCentavos).toBe(6200);

    // Guia B: valor válido apenas com alerta.
    const guiaB = entrada({ valor: "70,00" });
    expect(guiaB.resultado.motivos.filter((motivo) => motivo.severidade === "pendencia")).toEqual([]);
    expect(guiaB.resultado.motivos.some((motivo) => motivo.severidade === "alerta")).toBe(true);
    expect(guiaB.guia.valorCentavos).toBe(7000);

    // Guia C: pendente com valorCentavos null.
    const guiaC = entrada({ valor: "" });
    expect(guiaC.guia.valorCentavos).toBeNull();
    expect(guiaC.resultado.limitacoes).toContain("valor_fora_das_somas");

    const agregado = api.agregarVerificacoes([guiaA, guiaB, guiaC]);

    expect(agregado.ocorrencias).toBe(4);
    expect(agregado.guiasComPendencia).toBe(2);
    expect(agregado.valorAssociadoCentavos).toBe(6200);
    expect(agregado.totalIncompleto).toBe(true);

    // Com apenas valores válidos, a exposição não fica incompleta.
    const agregadoValido = api.agregarVerificacoes([guiaA, guiaB]);
    expect(agregadoValido.totalIncompleto).toBe(false);
    expect(agregadoValido.valorAssociadoCentavos).toBe(6200);
  });
});
