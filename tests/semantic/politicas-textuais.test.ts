// Testes travados da task-3-politicas-textuais (feature
// semantic-observation-interpretation):
//   lt-politicas-materiais-e-benignas      — sinais validados → motivos/limitações
//                                            textuais fixos; sinais benignos sem
//                                            efeito; só pendências determinísticas
//                                            controlam OK/PENDENTE (#ac-4..7,9,11);
//   lt-ambiguidade-especifica-e-ordem      — ambiguidade material → conferência
//                                            humana específica por tipo, ordem
//                                            textual estável após os estruturados
//                                            (#ac-21);
//   lt-motor-incompleto-e-retrocompativel  — sem textual o motor não regride;
//                                            incompleto preserva achados e
//                                            acrescenta checagem_textual_incompleta
//                                            (#ac-12).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local;
// nenhum tipo é importado do src. A RED é por asserção de comportamento/superfície
// faltante — `aplicarPoliticasTextuais` ainda inexistente, `inferencia_textual`
// ainda ausente e `textual` ainda ignorado pelo motor — nunca por erro de
// coleta/import: em todo teste que usa o motor as asserções de comportamento vêm
// antes da guarda de superfície, para que a falha observada seja a ausência do
// efeito, não um `not to be a function`.
//
// Superfície congelada por este teste:
//   aplicarPoliticasTextuais(textual: TextualValidado)
//     → { motivos: Motivo[]; limitacoes: string[]; estado: "completa" | "incompleta" }
//       pura, sem I/O, sem relógio e sem `id_guia`; nunca devolve decisão.
//   verificarGuia(guia, catalogo, { referenciaTemporal?, textual? })
//     com `textual?: TextualValidado | null`; ausente/null preserva o atual.
//   ResultadoVerificacao.inferencia_textual: { modelo; prompt_versao } | null
//     preenchido somente quando houve tentativa de extração.
import { describe, expect, it } from "vitest";

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

interface InferenciaTextual {
  modelo: string;
  prompt_versao: string;
}

interface ResultadoVerificacao {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
  orientacoes: string[];
  limitacoes: string[];
  checagem_textual: "completa" | "incompleta" | "nao_aplicavel";
  referencia_temporal: string | null;
  regras_versao: string;
  inferencia_textual: InferenciaTextual | null;
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

interface Sinal {
  tipo: string;
  evidencia: string;
}

interface Ambiguidade {
  tipo: string;
  evidencia: string;
}

interface SituacaoTextual {
  autorizacao: "nenhuma" | "nova_nao_cadastrada" | "verbal_sem_numero";
  modalidade: "nenhuma" | "particular_decidido" | "somente_pergunta";
  procedimento: "nenhuma" | "realizado_divergente";
  reagendamento: "nenhum" | "mencionado";
}

interface SinaisObservacao {
  sinais: Sinal[];
  situacao: SituacaoTextual;
  ambiguidades: Ambiguidade[];
}

interface TextualValidado {
  estado: "completa" | "incompleta";
  sinais: SinaisObservacao | null;
  modelo: string | null;
  prompt_versao: string | null;
}

interface PoliticasTextuais {
  motivos: Motivo[];
  limitacoes: string[];
  estado: "completa" | "incompleta";
}

interface OpcoesVerificacao {
  referenciaTemporal?: DataCivil;
  textual?: TextualValidado | null;
}

interface ApiAprovada {
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
  verificarGuia(
    guia: GuiaNormalizada,
    catalogo: Catalogo,
    opcoes?: OpcoesVerificacao,
  ): ResultadoVerificacao;
  aplicarPoliticasTextuais(textual: TextualValidado): PoliticasTextuais;
}

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

const MODELO = "modelo-teste";
const PROMPT_VERSAO = "observacao-v1";

// Ordem determinística dos códigos textuais (§3.5): mesma tabela da spec seguida
// de `checagem_textual_incompleta` (§3.6). Todos entram após os estruturados.
const ORDEM_TEXTUAL = [
  "autorizacao_nova_nao_cadastrada",
  "autorizacao_verbal_sem_numero",
  "modalidade_particular_contraditoria",
  "procedimento_realizado_divergente",
  "conferencia_humana_especifica",
  "checagem_textual_incompleta",
] as const;

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

const CAMPOS_OBRIGATORIOS = [
  "numero_autorizacao",
  "autorizacao_validade",
  "profissional_registro",
  "carteirinha",
  "cid",
];

// Dois convênios equivalentes (mesmos obrigatórios/cobertura/prazos, só o nome
// difere) para provar que a política de autorização verbal é genérica e não
// depende do convênio (§7.12).
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
      campos_obrigatorios: CAMPOS_OBRIGATORIOS,
      validade_maxima_autorizacao_dias: 30,
      limite_sessoes_por_autorizacao: 10,
      procedimentos_cobertos: ["50000470", "50000560"],
      prazo_envio_dias: 30,
      observacao: "Reavaliação médica obrigatória a cada 10 sessões.",
    },
    {
      nome: "VivaMais",
      campos_obrigatorios: CAMPOS_OBRIGATORIOS,
      validade_maxima_autorizacao_dias: 30,
      limite_sessoes_por_autorizacao: 10,
      procedimentos_cobertos: ["50000470", "50000560"],
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
    id_guia: "SYN-POL-0001",
    unidade: "Sul",
    data_atendimento: "2026-08-10",
    paciente: "P-9200",
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
  opcoes?: OpcoesVerificacao,
): { guia: GuiaNormalizada; resultado: ResultadoVerificacao } {
  const guia = api.normalizarGuia(linhaBase(overrides));
  const resultado = api.verificarGuia(guia, catalogo(), opcoes);
  return { guia, resultado };
}

function situacao(overrides: Partial<SituacaoTextual> = {}): SituacaoTextual {
  return {
    autorizacao: "nenhuma",
    modalidade: "nenhuma",
    procedimento: "nenhuma",
    reagendamento: "nenhum",
    ...overrides,
  };
}

function textualCompleto(
  sinais: Sinal[],
  overrides: Partial<SituacaoTextual> = {},
  ambiguidades: Ambiguidade[] = [],
): TextualValidado {
  return {
    estado: "completa",
    sinais: { sinais, situacao: situacao(overrides), ambiguidades },
    modelo: MODELO,
    prompt_versao: PROMPT_VERSAO,
  };
}

/** Guarda a superfície nova e só então a exercita; usada após as asserções de comportamento. */
function aplicarPoliticas(textual: TextualValidado): PoliticasTextuais {
  expect(typeof api.aplicarPoliticasTextuais).toBe("function");
  return api.aplicarPoliticasTextuais(textual);
}

function motivo(resultado: ResultadoVerificacao, codigo: string): Motivo | undefined {
  return resultado.motivos.find((item) => item.codigo === codigo);
}

function codigos(resultado: ResultadoVerificacao): string[] {
  return resultado.motivos.map((item) => item.codigo);
}

const EVIDENCIA_NOVA = "nova autorização emitida pela operadora";
const EVIDENCIA_VERBAL = "autorizado por telefone, protocolo PROT-778899";
const EVIDENCIA_PARTICULAR = "paciente pediu para faturar como particular";
const EVIDENCIA_PROCEDIMENTO = "foi realizado também o procedimento 50000560";

describe("lt-politicas-materiais-e-benignas", () => {
  it("autorização nova preserva autorizacao_vencida e acrescenta numero/validade sem liberar a guia", () => {
    const textual = textualCompleto(
      [{ tipo: "autorizacao_nova_nao_cadastrada", evidencia: EVIDENCIA_NOVA }],
      { autorizacao: "nova_nao_cadastrada" },
    );

    // Composição no motor: o achado estruturado é preservado, não substituído.
    const { resultado } = verificar({ autorizacao_validade: "2026-08-09" }, { textual });
    expect(resultado.checagem_textual).toBe("completa");
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
    expect(motivo(resultado, "autorizacao_nova_nao_cadastrada")).toBeDefined();
    expect(resultado.decisao).toBe("PENDENTE");

    const politicas = aplicarPoliticas(textual);
    const novo = politicas.motivos.find(
      (item) => item.codigo === "autorizacao_nova_nao_cadastrada",
    );
    expect(novo).toBeDefined();
    expect(novo!.severidade).toBe("pendencia");
    expect(novo!.campos).toEqual(
      expect.arrayContaining(["numero_autorizacao", "autorizacao_validade"]),
    );
    expect(novo!.evidencia).toContain(EVIDENCIA_NOVA);
    expect(novo!.regra.length).toBeGreaterThan(0);
    expect(novo!.orientacao.length).toBeGreaterThan(0);
    // Orientação gerada em TypeScript: o texto livre do modelo não é exibido.
    expect(novo!.orientacao).not.toContain(EVIDENCIA_NOVA);
  });

  it("autorização verbal em qualquer convênio exige numero_autorizacao sem copiar protocolo nem afirmar cinco dias úteis", () => {
    const textual = textualCompleto(
      [{ tipo: "autorizacao_verbal_sem_numero", evidencia: EVIDENCIA_VERBAL }],
      { autorizacao: "verbal_sem_numero" },
    );

    // Política genérica: o mesmo motivo aparece em todo convênio do catálogo,
    // sem citar o nome do convênio e sem gravar o protocolo na guia.
    for (const convenio of ["Vitalcard", "VivaMais"]) {
      // Verbal sem número formal: a guia chega sem `numero_autorizacao`.
      const { guia, resultado } = verificar(
        { convenio, numero_autorizacao: "" },
        { textual },
      );
      const motivoConvenio = motivo(resultado, "autorizacao_verbal_sem_numero");
      expect(motivoConvenio, `convênio ${convenio}`).toBeDefined();
      expect(motivoConvenio!.campos).toContain("numero_autorizacao");
      expect(motivoConvenio!.orientacao).not.toContain(convenio);
      // O protocolo não é copiado para o campo formal nem o preenche.
      expect(guia.numeroAutorizacao).toBe("");
      expect(guia.numeroAutorizacao).not.toContain("PROT-778899");
      expect(resultado.decisao).toBe("PENDENTE");
    }

    const politicas = aplicarPoliticas(textual);
    const verbal = politicas.motivos.find(
      (item) => item.codigo === "autorizacao_verbal_sem_numero",
    );
    expect(verbal).toBeDefined();
    expect(verbal!.severidade).toBe("pendencia");
    // Exige o número formal (o protocolo não substitui numero_autorizacao).
    expect(verbal!.campos).toContain("numero_autorizacao");
    expect(verbal!.evidencia).toContain(EVIDENCIA_VERBAL);
    expect(politicas.limitacoes).toContain("prazo_autorizacao_verbal_nao_calculado");

    // Orientação/regra geradas em TypeScript: não reproduzem o texto livre.
    expect(verbal!.orientacao).not.toContain(EVIDENCIA_VERBAL);
    expect(verbal!.regra).not.toContain(EVIDENCIA_VERBAL);

    // O protocolo não é reapresentado como número nem convertido em prazo.
    const textoPolitica = `${verbal!.regra} ${verbal!.orientacao}`;
    expect(textoPolitica).not.toContain("PROT-778899");
    expect(textoPolitica).not.toMatch(/cinco|5\s*dias|dias\s*úteis|uteis/i);
  });

  it("particular decidido gera pendência de convênio", () => {
    const textual = textualCompleto(
      [{ tipo: "decisao_por_particular", evidencia: EVIDENCIA_PARTICULAR }],
      { modalidade: "particular_decidido" },
    );

    const { resultado } = verificar({}, { textual });
    expect(motivo(resultado, "modalidade_particular_contraditoria")).toBeDefined();
    expect(resultado.decisao).toBe("PENDENTE");

    const particular = aplicarPoliticas(textual).motivos.find(
      (item) => item.codigo === "modalidade_particular_contraditoria",
    );
    expect(particular).toBeDefined();
    expect(particular!.severidade).toBe("pendencia");
    expect(particular!.campos).toContain("convenio");
    expect(particular!.evidencia).toContain(EVIDENCIA_PARTICULAR);
    // Orientação/regra geradas em TypeScript: não reproduzem o texto livre.
    expect(particular!.orientacao).not.toContain(EVIDENCIA_PARTICULAR);
    expect(particular!.regra).not.toContain(EVIDENCIA_PARTICULAR);
  });

  it("procedimento divergente preserva as duas versões sem escolher código substituto", () => {
    const textual = textualCompleto(
      [{ tipo: "procedimento_realizado_divergente", evidencia: EVIDENCIA_PROCEDIMENTO }],
      { procedimento: "realizado_divergente" },
    );

    const { guia, resultado } = verificar({}, { textual });
    // As duas versões: o código estruturado da guia permanece intacto e a versão
    // textual aparece na evidência literal do motivo.
    expect(guia.procedimentoCodigo).toBe("50000470");
    expect(motivo(resultado, "procedimento_realizado_divergente")).toBeDefined();
    expect(motivo(resultado, "procedimento_realizado_divergente")!.evidencia).toContain(
      EVIDENCIA_PROCEDIMENTO,
    );
    expect(resultado.decisao).toBe("PENDENTE");

    const divergente = aplicarPoliticas(textual).motivos.find(
      (item) => item.codigo === "procedimento_realizado_divergente",
    );
    expect(divergente).toBeDefined();
    expect(divergente!.severidade).toBe("pendencia");
    expect(divergente!.campos).toContain("procedimento_codigo");
    expect(divergente!.evidencia).toContain(EVIDENCIA_PROCEDIMENTO);
    // Orientação/regra geradas em TypeScript: não reproduzem o texto livre.
    expect(divergente!.orientacao).not.toContain(EVIDENCIA_PROCEDIMENTO);
    expect(divergente!.regra).not.toContain(EVIDENCIA_PROCEDIMENTO);
  });

  it("reagendamento, pergunta de preço, recibo e notas repetidas não geram motivo e não controlam a decisão", () => {
    const textual = textualCompleto(
      [
        { tipo: "reagendamento_mencionado", evidencia: "reagendou para a próxima semana" },
        { tipo: "pergunta_sobre_preco_particular", evidencia: "quanto custa no particular" },
        { tipo: "pedido_de_recibo", evidencia: "precisa do recibo" },
        { tipo: "nota_administrativa", evidencia: "chegou atrasado" },
        { tipo: "nota_administrativa", evidencia: "confirmou pelo WhatsApp" },
        { tipo: "nota_administrativa", evidencia: "exame anexado" },
      ],
      { modalidade: "somente_pergunta", reagendamento: "mencionado" },
    );

    // Só pendências determinísticas controlam a decisão: sem achado material e
    // com a guia estruturada limpa, o resultado permanece OK.
    const { resultado } = verificar({}, { textual });
    expect(resultado.motivos).toEqual([]);
    expect(resultado.decisao).toBe("OK");
    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.inferencia_textual).toEqual({
      modelo: MODELO,
      prompt_versao: PROMPT_VERSAO,
    });

    const politicas = aplicarPoliticas(textual);
    expect(politicas.estado).toBe("completa");
    expect(politicas.motivos).toEqual([]);
  });

  it("aplicarPoliticasTextuais é pura, determinística e nunca devolve decisão nem usa id_guia", () => {
    const textual = textualCompleto(
      [{ tipo: "autorizacao_nova_nao_cadastrada", evidencia: EVIDENCIA_NOVA }],
      { autorizacao: "nova_nao_cadastrada" },
    );

    // O resultado não depende de `id_guia`: duas guias idênticas mudando só o
    // identificador produzem os mesmos motivos textuais.
    const comA = verificar({ id_guia: "SYN-TX-A" }, { textual });
    const comB = verificar({ id_guia: "SYN-TX-B" }, { textual });
    expect(codigos(comB.resultado)).toEqual(codigos(comA.resultado));

    const antes = JSON.parse(JSON.stringify(textual)) as TextualValidado;
    const primeira = aplicarPoliticas(textual);
    const segunda = aplicarPoliticas(JSON.parse(JSON.stringify(textual)) as TextualValidado);

    // Mesma entrada, mesma saída; nenhuma mutação do argumento.
    expect(segunda).toEqual(primeira);
    expect(textual).toEqual(antes);

    // A política só decide por motivos; o modelo não controla OK/PENDENTE.
    expect(primeira).not.toHaveProperty("decisao");
    expect(primeira.estado).toBe("completa");
    expect(primeira.motivos.every((item) => item.severidade === "pendencia")).toBe(true);
  });
});

describe("lt-ambiguidade-especifica-e-ordem", () => {
  const AMBIGUIDADES: Ambiguidade[] = [
    { tipo: "autorizacao_indefinida", evidencia: "autorização ainda não registrada no sistema" },
    { tipo: "modalidade_indefinida", evidencia: "modalidade da guia está indefinida no momento" },
    { tipo: "procedimento_indefinido", evidencia: "procedimento não confirmado pela unidade" },
    { tipo: "outro_material", evidencia: "há detalhe material a esclarecer com a equipe" },
  ];

  const textual = textualCompleto(
    [
      { tipo: "autorizacao_nova_nao_cadastrada", evidencia: EVIDENCIA_NOVA },
      { tipo: "decisao_por_particular", evidencia: EVIDENCIA_PARTICULAR },
      { tipo: "procedimento_realizado_divergente", evidencia: EVIDENCIA_PROCEDIMENTO },
    ],
    {
      autorizacao: "nova_nao_cadastrada",
      modalidade: "particular_decidido",
      procedimento: "realizado_divergente",
    },
    AMBIGUIDADES,
  );

  it("ambiguidade material mantém checagem completa e gera conferência humana específica por tipo", () => {
    const { resultado } = verificar({ autorizacao_validade: "2026-08-09" }, { textual });

    // Ambiguidade material não é falha operacional: continua `completa`.
    expect(resultado.checagem_textual).toBe("completa");

    const conferencias = resultado.motivos.filter(
      (item) => item.codigo === "conferencia_humana_especifica",
    );
    expect(conferencias).toHaveLength(AMBIGUIDADES.length);
    // Não é bloqueio genérico: cada ambiguidade sai com o código específico.
    expect(conferencias.every((item) => item.severidade === "pendencia")).toBe(true);

    // Evidência literal preservada, uma por ambiguidade.
    AMBIGUIDADES.forEach((ambiguidade, indice) => {
      expect(conferencias[indice]!.evidencia).toContain(ambiguidade.evidencia);
    });

    // Texto fixo por tipo: orientações distintas entre si e nunca o texto livre
    // do modelo (a evidência literal).
    const orientacoes = conferencias.map((item) => item.orientacao);
    expect(new Set(orientacoes).size).toBe(AMBIGUIDADES.length);
    expect(orientacoes.every((item) => item.length > 0)).toBe(true);
    for (const conferencia of conferencias) {
      for (const ambiguidade of AMBIGUIDADES) {
        expect(conferencia.orientacao).not.toContain(ambiguidade.evidencia);
      }
    }

    // Não é aprovação irrestrita.
    expect(resultado.decisao).toBe("PENDENTE");
  });

  it("motivos textuais entram após os estruturados em ordem estável", () => {
    const { resultado } = verificar({ autorizacao_validade: "2026-08-09" }, { textual });
    const sequencia = codigos(resultado);

    // Estruturados primeiro, textuais depois, na posição fixa de ORDEM_TEXTUAL.
    expect(sequencia).toEqual([
      "autorizacao_vencida",
      "autorizacao_nova_nao_cadastrada",
      "modalidade_particular_contraditoria",
      "procedimento_realizado_divergente",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
    ]);
    const ultimoEstruturado = sequencia.findLastIndex(
      (codigo) => !ORDEM_TEXTUAL.includes(codigo as (typeof ORDEM_TEXTUAL)[number]),
    );
    const primeiroTextual = sequencia.findIndex((codigo) =>
      ORDEM_TEXTUAL.includes(codigo as (typeof ORDEM_TEXTUAL)[number]),
    );
    expect(primeiroTextual).toBeGreaterThan(ultimoEstruturado);

    // Ordem estável: mesma entrada produz a mesma sequência.
    const repetida = verificar(
      { autorizacao_validade: "2026-08-09" },
      { textual: JSON.parse(JSON.stringify(textual)) as TextualValidado },
    );
    expect(codigos(repetida.resultado)).toEqual(sequencia);

    // Ordem fixa dos códigos textuais na função pura.
    expect(aplicarPoliticas(textual).motivos.map((item) => item.codigo)).toEqual([
      "autorizacao_nova_nao_cadastrada",
      "modalidade_particular_contraditoria",
      "procedimento_realizado_divergente",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
      "conferencia_humana_especifica",
    ]);
  });
});

describe("lt-motor-incompleto-e-retrocompativel", () => {
  it("sem opção textual o motor mantém nao_aplicavel, inferencia_textual null e os mesmos motivos/decisão", () => {
    const semOpcao = verificar({ autorizacao_validade: "2026-08-09" });
    const comNull = verificar({ autorizacao_validade: "2026-08-09" }, { textual: null });
    const comVazio = verificar({ autorizacao_validade: "2026-08-09" }, {});

    expect(semOpcao.resultado.inferencia_textual).toBeNull();
    expect(semOpcao.resultado.checagem_textual).toBe("nao_aplicavel");
    expect(codigos(semOpcao.resultado)).toEqual(["autorizacao_vencida"]);
    expect(semOpcao.resultado.decisao).toBe("PENDENTE");

    // `null` e a ausência da opção são equivalentes e preservam a regressão.
    expect(comNull.resultado.inferencia_textual).toBeNull();
    expect(comNull.resultado.checagem_textual).toBe("nao_aplicavel");
    expect(comNull.resultado.motivos).toEqual(semOpcao.resultado.motivos);
    expect(comNull.resultado.limitacoes).toEqual(semOpcao.resultado.limitacoes);
    expect(comNull.resultado.decisao).toBe(semOpcao.resultado.decisao);
    expect(comVazio.resultado.motivos).toEqual(semOpcao.resultado.motivos);
    expect(comVazio.resultado.inferencia_textual).toBeNull();

    // Guia limpa sem textual continua OK.
    const limpa = verificar({});
    expect(limpa.resultado.decisao).toBe("OK");
    expect(limpa.resultado.inferencia_textual).toBeNull();
  });

  it("textual incompleto preserva os motivos estruturados e acrescenta exatamente checagem_textual_incompleta", () => {
    const incompleto: TextualValidado = {
      estado: "incompleta",
      sinais: null,
      modelo: MODELO,
      prompt_versao: PROMPT_VERSAO,
    };

    const base = verificar({ autorizacao_validade: "2026-08-09" }).resultado;
    const resultado = verificar({ autorizacao_validade: "2026-08-09" }, {
      textual: incompleto,
    }).resultado;

    expect(resultado.checagem_textual).toBe("incompleta");

    // Preserva todos os achados determinísticos já calculados.
    for (const achado of base.motivos) {
      expect(
        resultado.motivos.some((item) => item.codigo === achado.codigo),
        `achado preservado: ${achado.codigo}`,
      ).toBe(true);
    }

    // Acrescenta exatamente a pendência de checagem, na posição fixa final.
    expect(codigos(resultado)).toEqual([
      ...codigos(base),
      "checagem_textual_incompleta",
    ]);
    expect(resultado.motivos.length).toBe(base.motivos.length + 1);

    const incompletas = resultado.motivos.filter(
      (item) => item.codigo === "checagem_textual_incompleta",
    );
    expect(incompletas).toHaveLength(1);
    expect(incompletas[0]!.severidade).toBe("pendencia");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.decisao).toBe("PENDENTE");

    const politicas = aplicarPoliticas(incompleto);
    expect(politicas.estado).toBe("incompleta");
    expect(politicas.limitacoes).toContain("checagem_textual_incompleta");
    expect(
      politicas.motivos.filter((item) => item.codigo === "checagem_textual_incompleta"),
    ).toHaveLength(1);
  });

  it("inferencia_textual registra metadados somente quando houve tentativa", () => {
    const comTentativa = verificar({}, {
      textual: { estado: "incompleta", sinais: null, modelo: MODELO, prompt_versao: PROMPT_VERSAO },
    }).resultado;
    expect(comTentativa.inferencia_textual).toEqual({
      modelo: MODELO,
      prompt_versao: PROMPT_VERSAO,
    });
    expect(comTentativa.checagem_textual).toBe("incompleta");

    // Incompleto sem tentativa (modelo/versão nulos) não registra metadados, mas
    // ainda fecha a checagem como incompleta.
    const semTentativa = verificar({}, {
      textual: { estado: "incompleta", sinais: null, modelo: null, prompt_versao: null },
    }).resultado;
    expect(semTentativa.inferencia_textual).toBeNull();
    expect(semTentativa.checagem_textual).toBe("incompleta");
    expect(
      semTentativa.motivos.filter((item) => item.codigo === "checagem_textual_incompleta"),
    ).toHaveLength(1);

    // Extração completa também registra o que foi usado.
    const completa = verificar({}, { textual: textualCompleto([]) }).resultado;
    expect(completa.checagem_textual).toBe("completa");
    expect(completa.inferencia_textual).toEqual({
      modelo: MODELO,
      prompt_versao: PROMPT_VERSAO,
    });
  });

  it("observação sem extração não libera a guia: OK vira PENDENTE", () => {
    const overrides = { observacao_recepcao: "Confirmado pelo WhatsApp na véspera." };

    const semTextual = verificar(overrides).resultado;
    expect(semTextual.decisao).toBe("OK");
    expect(semTextual.checagem_textual).toBe("nao_aplicavel");

    const comFalha = verificar(overrides, {
      textual: { estado: "incompleta", sinais: null, modelo: MODELO, prompt_versao: PROMPT_VERSAO },
    }).resultado;
    expect(comFalha.decisao).toBe("PENDENTE");
    expect(comFalha.checagem_textual).toBe("incompleta");
    expect(
      comFalha.motivos.filter((item) => item.codigo === "checagem_textual_incompleta"),
    ).toHaveLength(1);
    expect(comFalha.limitacoes).toContain("checagem_textual_incompleta");
  });
});
