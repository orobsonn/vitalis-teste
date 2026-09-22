// Teste travado lt-motor-regras-gerais — motor de verificação, fronteiras
// inclusivas, códigos canônicos, orientações e determinismo.
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

interface ProblemaNormalizacao {
  campo: string;
  codigo: string;
  valorOriginal: string;
}

interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  linhaOriginal: string;
  dataAtendimento: DataCivil | null;
  convenio: string;
  cid: string;
  procedimentoCodigo: string;
  procedimentoDescricao: string;
  numeroAutorizacao: string;
  autorizacaoValidade: DataCivil | null;
  autorizacaoSessoesLimite: number | null;
  sessaoNumero: number | null;
  profissionalRegistro: string;
  valorCentavos: number | null;
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
  definicoes: {},
  procedimentos: [
    {
      codigo: "50000470",
      descricao: "Sessão de fisioterapia musculoesquelética",
      valor_referencia: 62.0,
    },
    {
      codigo: "50000560",
      descricao: "Sessão de fisioterapia neurofuncional",
      valor_referencia: 70.0,
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
      procedimentos_cobertos: ["50000470", "50000560"],
      prazo_envio_dias: 30,
      observacao: "Reavaliação médica obrigatória a cada 10 sessões.",
    },
  ],
};

const ORIENTACAO_VENCIDA =
  "Atualize a autorização: a validade termina antes da data do atendimento.";
const ORIENTACAO_SESSAO =
  "Confirme a autorização ou divida o excedente: a posição da sessão passa do limite aplicável.";

function catalogo(): Catalogo {
  const resultado = api.carregarCatalogo(CATALOGO_JSON);
  if (!resultado.ok) {
    throw new Error(`catálogo sintético deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function linhaBase(overrides: Partial<Record<Coluna, string>> = {}): LinhaGuiaCsv {
  const base: Record<Coluna, string> = {
    id_guia: "SYN-MOTOR-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9100",
    convenio: "Vitalcard",
    carteirinha: "123456",
    cid: "M79.7",
    procedimento_codigo: "50000470",
    procedimento_descricao: "Sessão de fisioterapia musculoesquelética",
    numero_autorizacao: "AUT910001",
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
): { guia: GuiaNormalizada; resultado: ResultadoVerificacao } {
  const guia = api.normalizarGuia(linhaBase(overrides));
  const resultado = api.verificarGuia(guia, catalogo(), opcoes);
  return { guia, resultado };
}

function motivo(resultado: ResultadoVerificacao, codigo: string): Motivo | undefined {
  return resultado.motivos.find((item) => item.codigo === codigo);
}

function semPendencia(resultado: ResultadoVerificacao): Motivo[] {
  return resultado.motivos.filter((item) => item.severidade === "pendencia");
}

describe("verificarGuia — fronteiras inclusivas", () => {
  it("validade igual ao atendimento, sessão igual ao menor limite e prazo no dia limite não geram pendência", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const validadeIgual = verificar({ autorizacao_validade: "2026-08-10" });
    expect(semPendencia(validadeIgual.resultado)).toEqual([]);
    expect(validadeIgual.resultado.decisao).toBe("OK");

    const sessaoIgual = verificar({
      sessao_numero_na_autorizacao: "10",
      autorizacao_sessoes_limite: "10",
    });
    expect(semPendencia(sessaoIgual.resultado)).toEqual([]);
    expect(sessaoIgual.resultado.decisao).toBe("OK");

    // 2026-08-10 + prazo de 30 dias = 2026-09-09, aceito na igualdade.
    const prazoIgual = verificar({ data_lancamento: "2026-09-09" });
    expect(semPendencia(prazoIgual.resultado)).toEqual([]);
    expect(prazoIgual.resultado.decisao).toBe("OK");
    // A convenção de dias corridos é política do exercício: em todo cálculo de
    // prazo verificável a limitação aparece exatamente uma vez, nunca duplicada.
    expect(
      prazoIgual.resultado.limitacoes.filter(
        (item) => item === "prazo_como_politica_do_exercicio",
      ),
    ).toHaveLength(1);

    // Guia inédita segue exatamente as regras, sem consulta por ID.
    expect(validadeIgual.guia.id).toBe("SYN-MOTOR-0001");
  });

  it("validade anterior gera autorizacao_vencida com campos, regra, evidência e orientação canônica", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar({ autorizacao_validade: "2026-08-09" });
    const pendencia = motivo(resultado, "autorizacao_vencida");
    expect(pendencia).toBeDefined();
    expect(pendencia!.severidade).toBe("pendencia");
    expect(pendencia!.campos).toEqual(
      expect.arrayContaining(["autorizacao_validade", "data_atendimento"]),
    );
    expect(pendencia!.regra.length).toBeGreaterThan(0);
    expect(pendencia!.evidencia.length).toBeGreaterThan(0);
    expect(pendencia!.orientacao).toBe(ORIENTACAO_VENCIDA);
    expect(resultado.decisao).toBe("PENDENTE");
  });

  it("sessão seguinte ao menor limite gera sessao_acima_do_limite com orientação canônica", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar({ sessao_numero_na_autorizacao: "11" });
    const pendencia = motivo(resultado, "sessao_acima_do_limite");
    expect(pendencia).toBeDefined();
    expect(pendencia!.severidade).toBe("pendencia");
    expect(pendencia!.campos).toEqual(
      expect.arrayContaining(["sessao_numero_na_autorizacao", "autorizacao_sessoes_limite"]),
    );
    expect(pendencia!.orientacao).toBe(ORIENTACAO_SESSAO);
    expect(pendencia!.regra.length).toBeGreaterThan(0);
    expect(pendencia!.evidencia.length).toBeGreaterThan(0);
    expect(resultado.decisao).toBe("PENDENTE");
  });

  it("referência no dia seguinte ao prazo gera prazo_envio_excedido", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar(
      { data_lancamento: "2026-08-10" },
      { referenciaTemporal: { ano: 2026, mes: 9, dia: 10 } },
    );
    const pendencia = motivo(resultado, "prazo_envio_excedido");
    expect(pendencia).toBeDefined();
    expect(pendencia!.severidade).toBe("pendencia");
    expect(pendencia!.campos).toEqual(
      expect.arrayContaining(["data_atendimento", "data_lancamento"]),
    );
    expect(pendencia!.orientacao.length).toBeGreaterThan(0);
    expect(pendencia!.regra.length).toBeGreaterThan(0);
    expect(pendencia!.evidencia.length).toBeGreaterThan(0);
    expect(resultado.decisao).toBe("PENDENTE");
    expect(
      resultado.limitacoes.filter((item) => item === "prazo_como_politica_do_exercicio"),
    ).toHaveLength(1);
    // A regra atribui a convenção de dias corridos à política do exercício,
    // não a uma regra adicional fornecida pelo convênio.
    const regraNormalizada = pendencia!.regra
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    expect(regraNormalizada).toContain("politica do exercicio");
    expect(regraNormalizada).toContain("dias corridos");
  });
});

describe("verificarGuia — alertas e incoerências", () => {
  it("valor válido divergente gera alerta com a diferença sem mudar a decisão", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar({ valor: "70,00" });
    const alerta = motivo(resultado, "valor_divergente_da_referencia");
    expect(alerta).toBeDefined();
    expect(alerta!.severidade).toBe("alerta");
    expect(alerta!.campos).toEqual(["valor"]);
    expect(JSON.stringify(alerta)).toMatch(/800|8,00/);
    expect(resultado.decisao).toBe("OK");
    expect(semPendencia(resultado)).toEqual([]);
  });

  it("descrição contraditória preserva as duas versões", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar({ procedimento_descricao: "Descrição divergente" });
    const pendencia = motivo(resultado, "procedimento_descricao_divergente");
    expect(pendencia).toBeDefined();
    expect(pendencia!.campos).toEqual(
      expect.arrayContaining(["procedimento_codigo", "procedimento_descricao"]),
    );
    const texto = JSON.stringify(pendencia);
    expect(texto).toContain("Descrição divergente");
    expect(texto).toContain("Sessão de fisioterapia musculoesquelética");
  });

  it("descrição vazia ou apenas com espaços em procedimento catalogado também diverge e preserva as duas versões", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const descricaoCatalogo = "Sessão de fisioterapia musculoesquelética";
    const casos: Array<{ rotulo: string; descricao: string }> = [
      { rotulo: "vazia", descricao: "" },
      { rotulo: "somente espaços", descricao: "   " },
    ];

    for (const caso of casos) {
      const { guia, resultado } = verificar({ procedimento_descricao: caso.descricao });

      // O procedimento está catalogado: a ausência de texto não pode pular a
      // comparação com a descrição do catálogo.
      expect(guia.procedimentoCodigo).toBe("50000470");
      expect(resultado.decisao).toBe("PENDENTE");

      const divergencias = resultado.motivos.filter(
        (item) => item.codigo === "procedimento_descricao_divergente",
      );
      expect(divergencias).toHaveLength(1);

      const pendencia = divergencias[0]!;
      expect(pendencia.severidade).toBe("pendencia");
      expect(pendencia.campos).toEqual([
        "procedimento_codigo",
        "procedimento_descricao",
      ]);

      // A evidência preserva as duas versões: o valor cru da guia (vazio ou
      // apenas espaços) e a descrição do catálogo.
      expect(pendencia.evidencia).toContain("Guia:");
      expect(pendencia.evidencia).toContain(`Guia: "${caso.descricao}"`);
      expect(pendencia.evidencia).toContain(descricaoCatalogo);
    }
  });

  it("lançamento anterior ao atendimento gera cronologia_incoerente", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const { resultado } = verificar({ data_lancamento: "2026-08-09" });
    const pendencia = motivo(resultado, "cronologia_incoerente");
    expect(pendencia).toBeDefined();
    expect(pendencia!.severidade).toBe("pendencia");
    expect(pendencia!.campos).toEqual(
      expect.arrayContaining(["data_lancamento", "data_atendimento"]),
    );
  });

  it("convênio ou procedimento ausente/desconhecido gera motivo próprio e limitação sem inventar dados", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const casos: Array<{ overrides: Partial<Record<Coluna, string>>; codigo: string }> = [
      { overrides: { convenio: "" }, codigo: "convenio_ausente" },
      { overrides: { convenio: "Fantasma" }, codigo: "convenio_nao_catalogado" },
      { overrides: { procedimento_codigo: "" }, codigo: "procedimento_ausente" },
      { overrides: { procedimento_codigo: "99999999" }, codigo: "procedimento_nao_catalogado" },
    ];

    for (const caso of casos) {
      const { guia, resultado } = verificar(caso.overrides);
      expect(motivo(resultado, caso.codigo)).toBeDefined();
      expect(resultado.limitacoes.length).toBeGreaterThan(0);
      expect(resultado.decisao).toBe("PENDENTE");
      // Nada é substituído no dado original.
      expect(guia.original).toEqual(linhaBase(caso.overrides).original);
      // Não inventa cobertura sem catálogo.
      expect(resultado.motivos.some((item) => item.codigo === "procedimento_sem_cobertura")).toBe(
        false,
      );
    }
  });
});

describe("verificarGuia — determinismo e resultado completo", () => {
  it("mantém ordem determinística, orientações únicas e checagem textual não aplicável", () => {
    expect(typeof api.verificarGuia).toBe("function");

    const overrides: Partial<Record<Coluna, string>> = {
      autorizacao_validade: "2026-08-09",
      sessao_numero_na_autorizacao: "11",
      procedimento_descricao: "Outra descrição",
    };

    const primeiro = verificar(overrides);
    const segundo = verificar(overrides);

    expect(primeiro.resultado).toEqual(segundo.resultado);
    expect(primeiro.resultado.checagem_textual).toBe("nao_aplicavel");
    expect(primeiro.resultado.decisao).toBe("PENDENTE");

    for (const item of primeiro.resultado.motivos) {
      expect(item.campos).toEqual([...item.campos].sort());
    }

    expect(primeiro.resultado.orientacoes.length).toBeGreaterThanOrEqual(1);
    expect(new Set(primeiro.resultado.orientacoes).size).toBe(
      primeiro.resultado.orientacoes.length,
    );
    const orientacoesPendentes = new Set(
      semPendencia(primeiro.resultado).map((item) => item.orientacao),
    );
    for (const orientacao of primeiro.resultado.orientacoes) {
      expect(orientacoesPendentes.has(orientacao)).toBe(true);
    }
    expect(primeiro.resultado.orientacoes).toContain(ORIENTACAO_VENCIDA);
    expect(primeiro.resultado.orientacoes).toContain(ORIENTACAO_SESSAO);

    // O resultado sempre traz referência temporal e versão das regras.
    expect(primeiro.resultado.referencia_temporal).toBe("2026-08-11");
    expect(primeiro.resultado.regras_versao).toBe(catalogo().regrasVersao);
  });
});
