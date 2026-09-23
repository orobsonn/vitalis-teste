// Teste travado lt-oraculo-corpus-semantico — fecha o corpus completo (80 guias)
// pelo caminho central `conferirGuia` com um interpretador de fixture decidido
// por CONTEÚDO do texto (nunca por id_guia), sem rede e sem Workers AI:
//   - 44 observações vazias ⇒ `nao_aplicavel` e 0 chamadas ao modelo;
//   - 36 preenchidas ⇒ extração; 25 triplas distintas ⇒ 25 chamadas efetivas e 11
//     reaproveitamentos de cache (as triplas são recalculadas do CSV);
//   - agregado 32 PENDENTE / 48 OK / 237200 centavos;
//   - 0030/0034/0039/0041/0069 exibem os efeitos aprovados sem lookup por id
//     (#ac-1, #ac-2, #ac-4, #ac-5, #ac-6, #ac-7, #ac-8, #ac-22, §5).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// `conferirGuia` ainda não existe: a falha é de asserção no primeiro `expect` do
// caso, nunca de coleta/import. Fixtures entram com `?raw` (sem `node:fs`).
//
// Superfície congelada: `conferirGuia(guia, catalogo, opcoes)` do barrel
// semântico; o interpretador de fixture recebe apenas `EntradaObservacao`
// (texto, convênio, procedimento) e consulta `porTexto`; texto não mapeado lança.
import { describe, expect, it } from "vitest";

import csv from "../../docs/fontes/guias.csv?raw";
import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";
import oraculoRaw from "./fixtures/oraculo-corpus.json?raw";

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

interface FalhaCsv {
  numero: number;
  motivo: string;
  linhaOriginal: string;
}

interface GuiaNormalizada {
  id: string;
  original: GuiaOriginal;
  observacaoRecepcao: string;
  convenio: string;
  procedimentoCodigo: string;
  numeroAutorizacao: string;
  valorCentavos: number | null;
  dataAtendimento: DataCivil | null;
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

interface EntradaObservacao {
  observacao_recepcao: string;
  convenio: string;
  procedimento_codigo: string;
}

interface RespostaBruta {
  texto: string;
  modelo: string;
  promptVersao: string;
}

interface InterpretadorObservacao {
  extrair(entrada: EntradaObservacao): Promise<RespostaBruta>;
}

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

interface ContextoCache {
  modelo: string;
  promptVersao: string;
  promptHash: string;
}

interface ChaveCacheSemantica {
  chave: string;
  prefixo: string;
}

interface BindingCacheSemantico {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: { expirationTtl?: number }): Promise<void>;
  delete?(chave: string): Promise<void>;
}

interface AdaptadorCacheSemantico {
  ler(entrada: EntradaObservacao, contexto: ContextoCache): Promise<SinaisObservacao | null>;
  gravar(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
    sinais: SinaisObservacao,
  ): Promise<void>;
}

interface QuotaDeChamadas {
  consumir(): boolean;
}

interface ObservadorContadores {
  registrarChamada(): void;
  registrarCacheHit(): void;
  registrarRecusaQuota(): void;
}

interface EventoRedigido {
  evento: string;
  estado?: string;
  codigo?: string;
  cache_prefixo?: string;
  duracao_ms?: number;
  tentativas?: number;
  itens?: number;
}

interface RegistradorRedigido {
  info(evento: string, campos: { [chave: string]: unknown }): void;
}

interface OpcoesConferencia {
  interpretador?: InterpretadorObservacao | null;
  cache?: AdaptadorCacheSemantico | null;
  quota?: QuotaDeChamadas | null;
  registrador?: RegistradorRedigido;
  observador?: ObservadorContadores;
  timeoutMs?: number;
  agora?: () => number;
  classificarFalha?: (erro: unknown) => string;
}

interface ApiSemantica {
  MODELO_OBSERVACAO: string;
  versaoEfetivaDoPrompt(): string;
  criarAdaptadorCacheSemantico(
    kv: BindingCacheSemantico,
    opcoes?: { ttlSegundos?: number },
  ): AdaptadorCacheSemantico;
  criarQuotaDeChamadas(opcoes?: {
    limite?: number;
    janelaMs?: number;
    agora?: () => number;
    observador?: ObservadorContadores;
  }): QuotaDeChamadas;
  criarRegistradorRedigido(
    destino: (evento: EventoRedigido) => void,
    opcoes?: { observador?: ObservadorContadores },
  ): RegistradorRedigido;
  conferirGuia(
    guia: GuiaNormalizada,
    catalogo: Catalogo,
    opcoes?: OpcoesConferencia,
  ): Promise<ResultadoVerificacao>;
}

interface Entrada {
  guia: GuiaNormalizada;
  resultado: ResultadoVerificacao;
}

interface AgregacaoCorpus {
  ocorrencias: number;
  guiasComPendencia: number;
  valorAssociadoCentavos: number;
  porCodigo: Record<string, number>;
  camposObrigatoriosAusentes: Record<string, number>;
  totalIncompleto: boolean;
  limitacoesGlobais: string[];
}

interface ApiDominio {
  parseGuiasCsv(texto: string): { cabecalho: string[]; guias: LinhaGuiaCsv[]; falhas: FalhaCsv[] };
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
  agregarVerificacoes(
    entradas: Entrada[],
    limitacoesGlobaisDoCatalogo?: readonly string[],
  ): AgregacaoCorpus;
}

interface OraculoFixture {
  versao: number;
  porTexto: Record<string, SinaisObservacao>;
}

const modulosSemantica = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const semantica = Object.values(modulosSemantica)[0] as unknown as ApiSemantica | undefined;

const modulosDominio = import.meta.glob("../../src/domain/index.ts", { eager: true });
const dominio = Object.values(modulosDominio)[0] as unknown as ApiDominio | undefined;

const GLOBAL_NAO_VERIFICAVEL = "duracao_maxima_autorizacao_nao_verificavel";

function exigirSemantica(): ApiSemantica {
  expect(typeof semantica?.conferirGuia).toBe("function");
  return semantica!;
}

function exigirDominio(): ApiDominio {
  expect(typeof dominio?.normalizarGuia).toBe("function");
  return dominio!;
}

function carregarCatalogoValido(): Catalogo {
  const resultado = exigirDominio().carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function carregarOraculo(): OraculoFixture {
  return JSON.parse(oraculoRaw) as OraculoFixture;
}

function codigos(resultado: ResultadoVerificacao): string[] {
  return resultado.motivos.map((item) => item.codigo);
}

function motivo(resultado: ResultadoVerificacao, codigo: string): Motivo | undefined {
  return resultado.motivos.find((item) => item.codigo === codigo);
}

interface CorpusExecutado {
  entradas: Entrada[];
  agregado: AgregacaoCorpus;
  catalogo: Catalogo;
  porId: Map<string, Entrada>;
  chamadasInterpretador: EntradaObservacao[];
  chavesRecebidas: Set<string>;
  observadorChamadas: number;
  observadorHits: number;
  registros: EventoRedigido[];
  parsed: { guias: LinhaGuiaCsv[]; falhas: FalhaCsv[] };
}

// Executa o corpus completo pelo caminho central, com KV em memória, quota
// injetada e interpretador de fixture decidido por conteúdo do texto.
async function executarCorpus(): Promise<CorpusExecutado> {
  const api = exigirSemantica();
  const dominioApi = exigirDominio();
  const catalogo = carregarCatalogoValido();
  const oraculo = carregarOraculo();

  const parsed = dominioApi.parseGuiasCsv(csv);
  const armazem = new Map<string, string>();
  const chamadas: EntradaObservacao[] = [];
  const chavesRecebidas = new Set<string>();

  const kv: BindingCacheSemantico = {
    async get(chave) {
      return armazem.get(chave) ?? null;
    },
    async put(chave, valor) {
      armazem.set(chave, valor);
    },
  };

  const interpretador: InterpretadorObservacao = {
    async extrair(entrada) {
      chamadas.push({ ...entrada });
      for (const chave of Object.keys(entrada)) {
        chavesRecebidas.add(chave);
      }
      const extracao = oraculo.porTexto[entrada.observacao_recepcao];
      if (extracao === undefined) {
        // Texto não mapeado falha alto: o oráculo nunca inventa extração benigna.
        throw new Error(`texto não mapeado no oráculo: ${entrada.observacao_recepcao}`);
      }
      return {
        texto: JSON.stringify(extracao),
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      };
    },
  };

  let observadorChamadas = 0;
  let observadorHits = 0;
  const observador: ObservadorContadores = {
    registrarChamada() {
      observadorChamadas += 1;
    },
    registrarCacheHit() {
      observadorHits += 1;
    },
    registrarRecusaQuota() {
      throw new Error("quota não deveria ser recusada no oráculo");
    },
  };

  const registros: EventoRedigido[] = [];
  const registrador = api.criarRegistradorRedigido((evento) => {
    registros.push(evento);
  });

  const quota = api.criarQuotaDeChamadas({ limite: 1000, observador });
  const cache = api.criarAdaptadorCacheSemantico(kv);

  const entradas: Entrada[] = [];
  for (const linha of parsed.guias) {
    const guia = dominioApi.normalizarGuia(linha);
    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador,
      cache,
      quota,
      observador,
      registrador,
    });
    entradas.push({ guia, resultado });
  }

  const agregado = dominioApi.agregarVerificacoes(entradas, catalogo.limitacoesGlobais);
  return {
    entradas,
    agregado,
    catalogo,
    porId: new Map(entradas.map((entrada) => [entrada.guia.id, entrada])),
    chamadasInterpretador: chamadas,
    chavesRecebidas,
    observadorChamadas,
    observadorHits,
    registros,
    parsed,
  };
}

// Texto distinto (não vazio) de cada guia, na ordem do arquivo.
function textosNaoVazios(parsed: { guias: LinhaGuiaCsv[] }): string[] {
  const vistos = new Set<string>();
  const textos: string[] = [];
  for (const linha of parsed.guias) {
    const texto = linha.original.observacao_recepcao;
    if (texto.trim() === "" || vistos.has(texto)) {
      continue;
    }
    vistos.add(texto);
    textos.push(texto);
  }
  return textos;
}

describe("lt-oraculo-corpus-semantico", () => {
  it("o fixture cobre exatamente os textos não vazios do CSV e não usa id_guia", () => {
    const dominioApi = exigirDominio();
    const parsed = dominioApi.parseGuiasCsv(csv);
    const oraculo = carregarOraculo();

    expect(oraculo.versao).toBe(1);

    const distintos = textosNaoVazios(parsed);
    expect(distintos).toHaveLength(9);
    expect(Object.keys(oraculo.porTexto).sort()).toEqual([...distintos].sort());

    // O oráculo é indexado por conteúdo; nenhum literal de id do corpus.
    for (const chave of Object.keys(oraculo.porTexto)) {
      expect(chave).not.toMatch(/G-2608-\d{4}/);
      expect(chave.trim()).not.toBe("");
    }
  });

  it("os 80 guias produzem 25 chamadas efetivas e 11 reaproveitamentos com 44 vazias em nao_aplicavel", async () => {
    const executado = await executarCorpus();

    expect(executado.parsed.guias).toHaveLength(80);
    expect(executado.parsed.falhas).toHaveLength(0);

    const vazias = executado.parsed.guias.filter(
      (linha) => linha.original.observacao_recepcao.trim() === "",
    );
    const preenchidas = executado.parsed.guias.filter(
      (linha) => linha.original.observacao_recepcao.trim() !== "",
    );
    expect(vazias).toHaveLength(44);
    expect(preenchidas).toHaveLength(36);

    // Triplas recalculadas do CSV: a deduplicação por cache é comparada com a
    // realidade do arquivo, não com um número decorado.
    const triplas = new Set(
      preenchidas.map(
        (linha) =>
          `${linha.original.observacao_recepcao}\u0000${linha.original.convenio}\u0000${linha.original.procedimento_codigo}`,
      ),
    );
    expect(triplas.size).toBe(25);

    // Chamadas efetivas = triplas distintas; reaproveitamentos = preenchidas − triplas.
    expect(executado.chamadasInterpretador).toHaveLength(triplas.size);
    expect(executado.observadorChamadas).toBe(triplas.size);
    expect(executado.observadorHits).toBe(preenchidas.length - triplas.size);
    expect(executado.observadorHits).toBe(11);

    // As guias vazias não chamam o interpretador e ficam `nao_aplicavel`.
    let vaziasNaoAplicaveis = 0;
    for (const linha of vazias) {
      const entrada = executado.porId.get(linha.original.id_guia);
      expect(entrada).toBeDefined();
      expect(entrada!.resultado.checagem_textual).toBe("nao_aplicavel");
      expect(entrada!.resultado.inferencia_textual).toBeNull();
      vaziasNaoAplicaveis += 1;
    }
    expect(vaziasNaoAplicaveis).toBe(44);

    // Toda observação preenchida foi interpretada com sucesso pelo fixture.
    for (const linha of preenchidas) {
      const entrada = executado.porId.get(linha.original.id_guia)!;
      expect(entrada.resultado.checagem_textual, linha.original.id_guia).toBe("completa");
      expect(entrada.resultado.inferencia_textual, linha.original.id_guia).toEqual({
        modelo: semantica!.MODELO_OBSERVACAO,
        prompt_versao: semantica!.versaoEfetivaDoPrompt(),
      });
    }

    // O interpretador recebeu apenas os três campos de domínio (sem id_guia).
    expect([...executado.chavesRecebidas].sort()).toEqual([
      "convenio",
      "observacao_recepcao",
      "procedimento_codigo",
    ]);
  });

  it("o agregado fecha em 32 PENDENTE, 48 OK e 237200 centavos sem liberar vazias", async () => {
    const executado = await executarCorpus();

    const pendentes = executado.entradas.filter((item) => item.resultado.decisao === "PENDENTE");
    const ok = executado.entradas.filter((item) => item.resultado.decisao === "OK");

    expect(pendentes).toHaveLength(32);
    expect(ok).toHaveLength(48);
    expect(executado.agregado.guiasComPendencia).toBe(32);
    expect(executado.agregado.valorAssociadoCentavos).toBe(237200);

    // A limitação global do catálogo continua propagada uma única vez.
    expect(
      executado.agregado.limitacoesGlobais.filter((item) => item === GLOBAL_NAO_VERIFICAVEL),
    ).toHaveLength(1);
  });

  it("exibe os efeitos aprovados das guias 0030/0034/0039/0041/0069", async () => {
    const executado = await executarCorpus();

    const guia30 = executado.porId.get("G-2608-0030")!;
    expect(guia30.resultado.decisao).toBe("PENDENTE");
    expect(guia30.resultado.checagem_textual).toBe("completa");
    expect(codigos(guia30.resultado)).toContain("autorizacao_vencida");
    expect(codigos(guia30.resultado)).toContain("autorizacao_nova_nao_cadastrada");
    expect(motivo(guia30.resultado, "autorizacao_nova_nao_cadastrada")!.campos).toEqual(
      expect.arrayContaining(["numero_autorizacao", "autorizacao_validade"]),
    );

    const guia34 = executado.porId.get("G-2608-0034")!;
    expect(guia34.resultado.decisao).toBe("OK");
    expect(guia34.resultado.checagem_textual).toBe("completa");
    expect(codigos(guia34.resultado)).not.toContain("checagem_textual_incompleta");

    const guia39 = executado.porId.get("G-2608-0039")!;
    expect(guia39.resultado.decisao).toBe("PENDENTE");
    expect(guia39.resultado.checagem_textual).toBe("completa");
    expect(motivo(guia39.resultado, "modalidade_particular_contraditoria")).toBeDefined();

    const guia41 = executado.porId.get("G-2608-0041")!;
    expect(guia41.resultado.decisao).toBe("PENDENTE");
    expect(guia41.resultado.checagem_textual).toBe("completa");
    expect(guia41.guia.numeroAutorizacao).toBe("");
    expect(motivo(guia41.resultado, "campo_obrigatorio_ausente")!.campos).toContain(
      "numero_autorizacao",
    );
    expect(motivo(guia41.resultado, "autorizacao_verbal_sem_numero")).toBeDefined();
    expect(guia41.resultado.limitacoes).toContain("prazo_autorizacao_verbal_nao_calculado");

    // O protocolo nunca é copiado para numero_autorizacao e não vira prazo.
    const texto41 = JSON.stringify(guia41.resultado);
    expect(guia41.guia.numeroAutorizacao).not.toContain("771203");
    expect(texto41).not.toContain("771203");
    for (const item of guia41.resultado.motivos) {
      expect(`${item.regra} ${item.orientacao}`).not.toMatch(
        /cinco|5\s*dias|dias\s*úteis|dias\s*uteis/i,
      );
    }

    const guia69 = executado.porId.get("G-2608-0069")!;
    expect(guia69.resultado.decisao).toBe("PENDENTE");
    expect(guia69.resultado.checagem_textual).toBe("completa");
    expect(guia69.guia.procedimentoCodigo).toBe("20103301");
    const divergente = motivo(guia69.resultado, "procedimento_realizado_divergente")!;
    expect(divergente.campos).toEqual(["procedimento_codigo"]);
    // Nenhum código substituto é escolhido ou gravado.
    expect(`${divergente.regra} ${divergente.orientacao}`).not.toMatch(/\d{5}/);
  });

  it("não registra corpos sensíveis nos eventos e nenhum literal G-2608 em src/semantic", async () => {
    const executado = await executarCorpus();

    const serializado = JSON.stringify(executado.registros);
    for (const linha of executado.parsed.guias) {
      if (linha.original.observacao_recepcao.trim() !== "") {
        expect(serializado).not.toContain(linha.original.observacao_recepcao);
      }
    }

    const fontes = import.meta.glob("../../src/semantic/**/*.ts", {
      query: "?raw",
      eager: true,
      import: "default",
    });
    expect(Object.keys(fontes).length).toBeGreaterThan(0);
    for (const conteudo of Object.values(fontes)) {
      expect(typeof conteudo).toBe("string");
      expect(conteudo).not.toMatch(/G-2608-\d{4}/);
    }
  });
});
