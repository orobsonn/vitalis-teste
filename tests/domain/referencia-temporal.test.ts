// Teste travado lt-referencia-temporal — precedência totalizada da referência
// temporal e cronologia independente.
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
  dataAtendimento: DataCivil | null;
  dataLancamento: DataCivil | null;
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

interface ApiAprovada {
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
  verificarGuia(
    guia: GuiaNormalizada,
    catalogo: Catalogo,
    opcoes?: { referenciaTemporal?: DataCivil },
  ): ResultadoVerificacao;
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

function catalogo(): Catalogo {
  const resultado = api.carregarCatalogo(CATALOGO_JSON);
  if (!resultado.ok) {
    throw new Error(`catálogo sintético deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function linhaBase(overrides: Partial<Record<Coluna, string>> = {}): LinhaGuiaCsv {
  const base: Record<Coluna, string> = {
    id_guia: "SYN-REF-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9200",
    convenio: "Vitalcard",
    carteirinha: "123456",
    cid: "M79.7",
    procedimento_codigo: "50000470",
    procedimento_descricao: "Sessão de fisioterapia musculoesquelética",
    numero_autorizacao: "AUT920001",
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

function verificar(
  overrides: Partial<Record<Coluna, string>> = {},
  opcoes?: { referenciaTemporal?: DataCivil },
): ResultadoVerificacao {
  const guia = api.normalizarGuia(linhaBase(overrides));
  return api.verificarGuia(guia, catalogo(), opcoes);
}

describe("referência temporal", () => {
  it("usa o override ISO quando presente, mesmo com lançamento válido", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const resultado = verificar(
      { data_lancamento: "2026-08-11" },
      { referenciaTemporal: { ano: 2026, mes: 9, dia: 20 } },
    );
    expect(resultado.referencia_temporal).toBe("2026-09-20");
    expect(resultado.limitacoes).not.toContain("prazo_nao_verificavel");
  });

  it("cai para o lançamento válido quando não há override", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const resultado = verificar({ data_lancamento: "2026-08-11" });
    expect(resultado.referencia_temporal).toBe("2026-08-11");
  });

  it("sem override e sem lançamento devolve null, uma única prazo_nao_verificavel e nenhum prazo calculado", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const resultado = verificar({ data_lancamento: "" });
    expect(resultado.referencia_temporal).toBeNull();
    expect(resultado.limitacoes.filter((item) => item === "prazo_nao_verificavel")).toHaveLength(1);
    expect(resultado.motivos.some((motivo) => motivo.codigo === "prazo_envio_excedido")).toBe(
      false,
    );
  });

  it("mantém cronologia_incoerente comparando o lançamento real, independentemente do override", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const resultado = verificar(
      { data_lancamento: "2026-08-09" },
      { referenciaTemporal: { ano: 2026, mes: 12, dia: 1 } },
    );
    // O override governa o prazo…
    expect(resultado.referencia_temporal).toBe("2026-12-01");
    expect(resultado.motivos.some((motivo) => motivo.codigo === "prazo_envio_excedido")).toBe(true);
    // …mas a cronologia continua comparando o lançamento real (anterior ao atendimento).
    expect(resultado.motivos.some((motivo) => motivo.codigo === "cronologia_incoerente")).toBe(
      true,
    );
  });
});
