// Teste travado lt-normalizacao-matriz-unica — normalização preservadora e
// matriz única de problemas (normalização × motor).
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

type CodigoProblema = "data_invalida" | "valor_ilegivel" | "campo_numerico_invalido";

interface ProblemaNormalizacao {
  campo: string;
  codigo: CodigoProblema;
  valorOriginal: string;
}

interface GuiaNormalizada {
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
  definicoes: {
    autorizacao_valida: "Validade inclusiva comparada ao atendimento.",
    sessao_numero_na_autorizacao: "Posição da sessão não pode passar do limite.",
    prazo_envio_dias: "Prazo contado da data do atendimento.",
    valor: "Valor de referência do procedimento, em reais.",
  },
  procedimentos: [
    {
      codigo: "50000470",
      descricao: "Sessão de fisioterapia musculoesquelética",
      valor_referencia: 62.0,
    },
    {
      codigo: "20103301",
      descricao: "Consulta ortopédica",
      valor_referencia: 90.0,
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
    id_guia: "SYN-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9001",
    convenio: "Vitalcard",
    carteirinha: "123456",
    cid: "M79.7",
    procedimento_codigo: "50000470",
    procedimento_descricao: "Sessão de fisioterapia musculoesquelética",
    numero_autorizacao: "AUT900001",
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

function semDuplicados(pares: Array<[string, string]>): void {
  const vistos = new Set<string>();
  for (const [codigo, campo] of pares) {
    const chave = `${codigo}|${campo}`;
    expect(vistos.has(chave)).toBe(false);
    vistos.add(chave);
  }
}

const ORIENTACAO_VALOR_ILEGIVEL =
  "Corrija o valor da guia para um número em reais com até duas casas decimais.";
const ORIENTACAO_REGISTRO =
  "Corrija o registro profissional para o formato CREFITO-n NNNNNN-F ou CRM-UF NNNNNN.";

describe("normalizarGuia — preservação e gramática", () => {
  it("preserva o original byte a byte e a linhaOriginal", () => {
    expect(typeof api.normalizarGuia).toBe("function");

    const linha = linhaBase({
      data_atendimento: "03/08/2026",
      valor: "62,00",
      observacao_recepcao: "Texto, com vírgula",
    });
    const guia = api.normalizarGuia(linha);

    expect(guia.original).toEqual(linha.original);
    expect(guia.original.data_atendimento).toBe("03/08/2026");
    expect(guia.original.valor).toBe("62,00");
    expect(guia.original.observacao_recepcao).toBe("Texto, com vírgula");
    expect(guia.linhaOriginal).toBe(linha.linhaOriginal);
  });

  it("trata zeros à esquerda e ausências sem problema", () => {
    expect(typeof api.normalizarGuia).toBe("function");

    const guia = api.normalizarGuia(
      linhaBase({ autorizacao_sessoes_limite: "007", sessao_numero_na_autorizacao: "007" }),
    );
    expect(guia.autorizacaoSessoesLimite).toBe(7);
    expect(guia.sessaoNumero).toBe(7);
    expect(guia.problemas).toEqual([]);
  });

  it("marca inteiros inválidos com campo_numerico_invalido e omite a checagem dependente", () => {
    expect(typeof api.normalizarGuia).toBe("function");
    expect(typeof api.verificarGuia).toBe("function");

    for (const valor of ["0", "-1", "1.5", "1e2", "abc", "10001"]) {
      const guiaLimite = api.normalizarGuia(linhaBase({ autorizacao_sessoes_limite: valor }));
      const problemasLimite = guiaLimite.problemas.filter(
        (problema) => problema.campo === "autorizacao_sessoes_limite",
      );
      expect(problemasLimite).toHaveLength(1);
      expect(problemasLimite[0]!.codigo).toBe("campo_numerico_invalido");
      expect(problemasLimite[0]!.valorOriginal).toBe(valor);
      expect(guiaLimite.autorizacaoSessoesLimite).toBeNull();

      const guiaSessao = api.normalizarGuia(
        linhaBase({ sessao_numero_na_autorizacao: valor }),
      );
      const problemasSessao = guiaSessao.problemas.filter(
        (problema) => problema.campo === "sessao_numero_na_autorizacao",
      );
      expect(problemasSessao).toHaveLength(1);
      expect(problemasSessao[0]!.codigo).toBe("campo_numerico_invalido");
      expect(problemasSessao[0]!.valorOriginal).toBe(valor);
      expect(guiaSessao.sessaoNumero).toBeNull();

      // Verificação dependente omitida, com limitação, para a posição inválida.
      const resultado = api.verificarGuia(guiaSessao, catalogo(), {
        referenciaTemporal: REFERENCIA,
      });
      expect(resultado.motivos.some((motivo) => motivo.codigo === "sessao_acima_do_limite")).toBe(
        false,
      );
      expect(resultado.limitacoes).toContain("sessao_nao_verificavel");

      // A checagem de limite também não decide com o campo malformado: a
      // verificação dependente é omitida e vira limitação.
      const resultadoLimite = api.verificarGuia(guiaLimite, catalogo(), {
        referenciaTemporal: REFERENCIA,
      });
      expect(
        resultadoLimite.motivos.some((motivo) => motivo.codigo === "sessao_acima_do_limite"),
      ).toBe(false);
      expect(resultadoLimite.limitacoes).toContain("limite_sessoes_nao_verificavel");
    }
  });
});

describe("normalizarGuia e verificarGuia — matriz única de problemas", () => {
  it("campo obrigatório vazio gera apenas campo_obrigatorio_ausente", () => {
    expect(typeof api.normalizarGuia).toBe("function");
    expect(typeof api.verificarGuia).toBe("function");

    const guia = api.normalizarGuia(linhaBase({ numero_autorizacao: "" }));
    const resultado = api.verificarGuia(guia, catalogo(), { referenciaTemporal: REFERENCIA });

    const motivos = resultado.motivos.filter((motivo) =>
      motivo.campos.includes("numero_autorizacao"),
    );
    expect(motivos.map((motivo) => motivo.codigo)).toEqual(["campo_obrigatorio_ausente"]);
    expect(resultado.decisao).toBe("PENDENTE");
  });

  it("campo preenchido malformado gera apenas seu problema de formato", () => {
    expect(typeof api.normalizarGuia).toBe("function");
    expect(typeof api.verificarGuia).toBe("function");

    const guiaData = api.normalizarGuia(linhaBase({ autorizacao_validade: "31/04/2026" }));
    const resultadoData = api.verificarGuia(guiaData, catalogo(), {
      referenciaTemporal: REFERENCIA,
    });
    const motivosData = resultadoData.motivos.filter((motivo) =>
      motivo.campos.includes("autorizacao_validade"),
    );
    expect(motivosData.map((motivo) => motivo.codigo)).toEqual(["data_invalida"]);
    expect(guiaData.autorizacaoValidade).toBeNull();

    const guiaValor = api.normalizarGuia(linhaBase({ valor: "6,2,0" }));
    const resultadoValor = api.verificarGuia(guiaValor, catalogo(), {
      referenciaTemporal: REFERENCIA,
    });
    const motivosValor = resultadoValor.motivos.filter((motivo) => motivo.campos.includes("valor"));
    expect(motivosValor.map((motivo) => motivo.codigo)).toEqual(["valor_ilegivel"]);
    expect(motivosValor[0]!.orientacao).toBe(ORIENTACAO_VALOR_ILEGIVEL);
    expect(guiaValor.valorCentavos).toBeNull();
    expect(resultadoValor.limitacoes).toContain("valor_fora_das_somas");
  });

  it("registra profissional: válidos sem motivo, malformados só com o problema próprio", () => {
    expect(typeof api.normalizarGuia).toBe("function");
    expect(typeof api.verificarGuia).toBe("function");

    for (const registro of ["CREFITO-3 204411-F", "CRM-SP 112390"]) {
      const guia = api.normalizarGuia(linhaBase({ profissional_registro: registro }));
      const resultado = api.verificarGuia(guia, catalogo(), { referenciaTemporal: REFERENCIA });
      expect(
        resultado.motivos.filter((motivo) => motivo.campos.includes("profissional_registro")),
      ).toEqual([]);
      expect(guia.original.profissional_registro).toBe(registro);
    }

    for (const registro of ["CREFITO 123", "CRM 123"]) {
      const guia = api.normalizarGuia(linhaBase({ profissional_registro: registro }));
      const resultado = api.verificarGuia(guia, catalogo(), { referenciaTemporal: REFERENCIA });
      const motivos = resultado.motivos.filter((motivo) =>
        motivo.campos.includes("profissional_registro"),
      );
      expect(motivos.map((motivo) => motivo.codigo)).toEqual(["profissional_registro_invalido"]);
      expect(motivos[0]!.orientacao).toBe(ORIENTACAO_REGISTRO);
    }
  });

  it("não repete nenhum par código/campo em normalização nem em motivos", () => {
    expect(typeof api.normalizarGuia).toBe("function");
    expect(typeof api.verificarGuia).toBe("function");

    const guia = api.normalizarGuia(
      linhaBase({
        numero_autorizacao: "",
        autorizacao_validade: "31/04/2026",
        sessao_numero_na_autorizacao: "abc",
        valor: "6,2,0",
        profissional_registro: "CRM 123",
      }),
    );
    const resultado = api.verificarGuia(guia, catalogo(), { referenciaTemporal: REFERENCIA });

    semDuplicados(guia.problemas.map((problema) => [problema.codigo, problema.campo]));
    semDuplicados(
      resultado.motivos.flatMap((motivo) =>
        motivo.campos.map((campo): [string, string] => [motivo.codigo, campo]),
      ),
    );

    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.orientacoes).toContain(ORIENTACAO_VALOR_ILEGIVEL);
    expect(resultado.orientacoes).toContain(ORIENTACAO_REGISTRO);
  });
});
