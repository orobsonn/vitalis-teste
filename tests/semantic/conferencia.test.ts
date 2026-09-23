// Testes travados da task-6-conferencia-central-corpus (feature
// semantic-observation-interpretation):
//   lt-conferencia-vazio-cache-e-falhas     — vazio após trim → `nao_aplicavel`
//                                             sem cache/modelo; hit válido →
//                                             `completa` sem modelo nem quota;
//                                             miss válido → 1 chamada + gravação;
//                                             KV lendo/gravando com falha ou cache
//                                             corrompido → miss/sem gravação e
//                                             extração válida ainda `completa`;
//                                             erro/timeout/configuração/schema/
//                                             evidência/quota/limite → PENDENTE/
//                                             `incompleta` com achados preservados
//                                             e `inferencia_textual` coerente
//                                             (#ac-12, #ac-17, #ac-18, #ac-22, §3.6);
//   lt-retentativa-timeout-e-limites        — 429/5xx retenta UMA vez de forma
//                                             sequencial (duas tentativas, duas
//                                             quotas); timeout local, configuração,
//                                             schema, evidência, limite, status não
//                                             transitório e erro desconhecido não
//                                             retentam; nunca há chamada sobreposta;
//                                             resposta > 16 KiB é rejeitada antes do
//                                             parse (#ac-17, §3.9);
//   lt-jornadas-administrativa-particular-falha — guia administrativa limpa vira
//                                             OK/completa com extração válida e
//                                             PENDENTE/incompleta sob erro ou timeout
//                                             (fail-closed); decisão por particular
//                                             vira PENDENTE por
//                                             `modalidade_particular_contraditoria`;
//                                             observação vazia mantém zero chamadas
//                                             (#ac-9, #ac-11, #ac-12, §3.6, §7.15).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// `conferirGuia` ainda não existe: a falha é de asserção no primeiro `expect` de
// cada caso, nunca de coleta/import. Nenhum módulo de `src` é importado por tipo.
//
// Superfície injetável congelada por este teste (o implementador deve casá-la):
//   conferirGuia(
//     guia: GuiaNormalizada,
//     catalogo: Catalogo,
//     opcoes?: OpcoesConferencia,
//   ): Promise<ResultadoVerificacao>
//
//   interface OpcoesConferencia {
//     referenciaTemporal?: DataCivil;                    // repassado ao motor
//     interpretador?: InterpretadorObservacao | null;    // ausente/null ⇒ sem tentativa
//     cache?: AdaptadorCacheSemantico | null;            // adaptador real sobre KV
//     quota?: QuotaDeChamadas | null;                    // consumida antes da chamada
//     registrador?: RegistradorRedigido;                 // eventos da allowlist
//     observador?: ObservadorContadores;                 // chamadas e cache hits efetivos
//     timeoutMs?: number;                                // padrão 5000
//     agora?: () => number;                              // relógio monotônico injetável
//     classificarFalha?: (erro: unknown) => ClassificacaoFalha; // fechado e injetável
//   }
//   type ClassificacaoFalha =
//     | "transporte" | "timeout" | "configuracao"
//     | "schema_invalido" | "evidencia_invalida" | "limite_excedido"
//     | "nao_transitorio";
//
// Regras de composição exercidas:
// - identidade de inferência e chave de cache vêm da configuração
//   (`MODELO_OBSERVACAO`, `versaoEfetivaDoPrompt()`, `PROMPT_HASH`), nunca do
//   texto da observação; `montarChaveCacheSemantica` recalcula a chave esperada
//   no teste a partir do texto CRU (não trimado — trim serve só para vazio e
//   limite).
// - tentativa = invocação do interpretador; `inferencia_textual` é
//   `{ modelo, prompt_versao }` quando houve tentativa e `null` quando não houve
//   (vazio, acima do limite, configuração ausente, quota recusada sem chamada).
// - `quota_de_chamadas_excedida` é o nome resolvido nesta tarefa para a limitação
//   de quota que a spec deixa sem nome literal (`observacao_acima_do_limite` é o
//   nome literal de §3.9 para o limite de entrada).
import { afterEach, describe, expect, it, vi } from "vitest";

import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";

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
  observacaoRecepcao: string;
  convenio: string;
  procedimentoCodigo: string;
  numeroAutorizacao: string;
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

interface OpcoesPut {
  expirationTtl?: number;
}

interface BindingCacheSemantico {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: OpcoesPut): Promise<void>;
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

interface CamposPermitidos {
  [chave: string]: unknown;
}

interface RegistradorRedigido {
  info(evento: string, campos: CamposPermitidos): void;
}

type ClassificacaoFalha =
  | "transporte"
  | "timeout"
  | "configuracao"
  | "schema_invalido"
  | "evidencia_invalida"
  | "limite_excedido"
  | "nao_transitorio";

interface OpcoesConferencia {
  referenciaTemporal?: DataCivil;
  interpretador?: InterpretadorObservacao | null;
  cache?: AdaptadorCacheSemantico | null;
  quota?: QuotaDeChamadas | null;
  registrador?: RegistradorRedigido;
  observador?: ObservadorContadores;
  timeoutMs?: number;
  agora?: () => number;
  classificarFalha?: (erro: unknown) => ClassificacaoFalha;
}

interface ApiSemantica {
  MODELO_OBSERVACAO: string;
  PROMPT_HASH: string;
  versaoEfetivaDoPrompt(): string;
  montarChaveCacheSemantica(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
  ): ChaveCacheSemantica;
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

interface ApiDominio {
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  normalizarGuia(linha: LinhaGuiaCsv): GuiaNormalizada;
}

const modulosSemantica = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const semantica = Object.values(modulosSemantica)[0] as unknown as ApiSemantica | undefined;

const modulosDominio = import.meta.glob("../../src/domain/index.ts", { eager: true });
const dominio = Object.values(modulosDominio)[0] as unknown as ApiDominio | undefined;

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

const TEXTO_PARTICULAR = "Paciente pediu para faturar como particular, não quer usar o convênio.";
const TEXTO_ADMIN = "Confirmado pelo WhatsApp na véspera.";
const EVIDENCIA_PARTICULAR = "faturar como particular";
const EVIDENCIA_ADMIN = "Confirmado pelo WhatsApp";
const LIMITE_ENTRADA = 1000;
const LIMITE_RESPOSTA_BYTES = 16 * 1024;
const TIMEOUT_PADRAO_MS = 5000;

const SITUACAO_NEUTRA: SituacaoTextual = {
  autorizacao: "nenhuma",
  modalidade: "nenhuma",
  procedimento: "nenhuma",
  reagendamento: "nenhum",
};

const SINAIS_NEUTROS: SinaisObservacao = {
  sinais: [],
  situacao: SITUACAO_NEUTRA,
  ambiguidades: [],
};

const SINAIS_PARTICULAR: SinaisObservacao = {
  sinais: [{ tipo: "decisao_por_particular", evidencia: EVIDENCIA_PARTICULAR }],
  situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
  ambiguidades: [],
};

const SINAIS_ADMIN: SinaisObservacao = {
  sinais: [{ tipo: "nota_administrativa", evidencia: EVIDENCIA_ADMIN }],
  situacao: SITUACAO_NEUTRA,
  ambiguidades: [],
};

// Guardas de superfície: o primeiro `expect` de cada caso é a existência de
// `conferirGuia`; as demais dependências já existem (tasks 1–5).
function exigirSemantica(): ApiSemantica {
  expect(typeof semantica?.conferirGuia).toBe("function");
  return semantica!;
}

function exigirDominio(): ApiDominio {
  expect(typeof dominio?.normalizarGuia).toBe("function");
  return dominio!;
}

function catalogoValido(): Catalogo {
  const resultado = exigirDominio().carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function linhaBase(overrides: Partial<Record<Coluna, string>> = {}): LinhaGuiaCsv {
  const base: Record<Coluna, string> = {
    id_guia: "SYN-CONF-0001",
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

function guiaSintetica(overrides: Partial<Record<Coluna, string>> = {}): GuiaNormalizada {
  return exigirDominio().normalizarGuia(linhaBase(overrides));
}

function entradaDe(guia: GuiaNormalizada): EntradaObservacao {
  return {
    observacao_recepcao: guia.observacaoRecepcao,
    convenio: guia.convenio,
    procedimento_codigo: guia.procedimentoCodigo,
  };
}

/** Contexto de cache derivado da configuração (nunca do texto). */
function contextoConfig(api: ApiSemantica): ContextoCache {
  return {
    modelo: api.MODELO_OBSERVACAO,
    promptVersao: api.versaoEfetivaDoPrompt(),
    promptHash: api.PROMPT_HASH,
  };
}

function chaveDe(api: ApiSemantica, entrada: EntradaObservacao): string {
  return api.montarChaveCacheSemantica(entrada, contextoConfig(api)).chave;
}

function resposta(api: ApiSemantica, sinais: SinaisObservacao): RespostaBruta {
  return {
    texto: JSON.stringify(sinais),
    modelo: api.MODELO_OBSERVACAO,
    promptVersao: api.versaoEfetivaDoPrompt(),
  };
}

type Passo = RespostaBruta | Error | "pendente";

interface InterpretadorFake {
  interpretador: InterpretadorObservacao;
  chamadas: EntradaObservacao[];
  eventos: string[];
  maxEmVoo(): number;
}

// Interpretador roteirizado: registra a ordem início/fim de cada chamada para
// provar sequencialidade e ausência de sobreposição faturável.
function criarInterpretadorFake(roteiro: Passo[]): InterpretadorFake {
  const chamadas: EntradaObservacao[] = [];
  const eventos: string[] = [];
  let emVoo = 0;
  let pico = 0;

  const interpretador: InterpretadorObservacao = {
    async extrair(entrada) {
      chamadas.push({ ...entrada });
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      const indice = chamadas.length;
      eventos.push(`inicio:${indice}`);

      const passo = roteiro[indice - 1];
      if (passo === undefined) {
        emVoo -= 1;
        eventos.push(`fim:${indice}`);
        throw new Error("interpretador não deveria ser chamado nesta jornada");
      }
      if (passo === "pendente") {
        // Promise que nunca resolve: o timeout local deve abandoná-la sem
        // disparar nova chamada nem sobreposição.
        return new Promise<RespostaBruta>(() => {});
      }

      try {
        if (passo instanceof Error) {
          throw passo;
        }
        return passo;
      } finally {
        emVoo -= 1;
        eventos.push(`fim:${indice}`);
      }
    },
  };

  return { interpretador, chamadas, eventos, maxEmVoo: () => pico };
}

interface KvFake {
  kv: BindingCacheSemantico;
  armazem: Map<string, string>;
  leituras: number;
  gravacoes: number;
  tentativasGravacao: number;
  falharLeitura(erro?: unknown): void;
  falharGravacao(erro?: unknown): void;
}

function criarKvFake(inicial: Record<string, string> = {}): KvFake {
  const armazem = new Map<string, string>(Object.entries(inicial));
  let erroLeitura: unknown = null;
  let erroGravacao: unknown = null;
  const estado = {
    leituras: 0,
    gravacoes: 0,
    tentativasGravacao: 0,
  };

  const kv: BindingCacheSemantico = {
    async get(chave) {
      estado.leituras += 1;
      if (erroLeitura) {
        throw erroLeitura;
      }
      return armazem.get(chave) ?? null;
    },
    async put(chave, valor) {
      estado.tentativasGravacao += 1;
      if (erroGravacao) {
        throw erroGravacao;
      }
      estado.gravacoes += 1;
      armazem.set(chave, valor);
    },
    async delete(chave) {
      armazem.delete(chave);
    },
  };

  return {
    kv,
    armazem,
    get leituras() {
      return estado.leituras;
    },
    get gravacoes() {
      return estado.gravacoes;
    },
    get tentativasGravacao() {
      return estado.tentativasGravacao;
    },
    falharLeitura(erro = new Error("KV indisponível na leitura")) {
      erroLeitura = erro;
    },
    falharGravacao(erro = new Error("KV indisponível na gravação")) {
      erroGravacao = erro;
    },
  };
}

interface ObservadorFake {
  observador: ObservadorContadores;
  chamadas: number;
  cacheHits: number;
  recusasQuota: number;
}

function criarObservadorFake(): ObservadorFake {
  const estado = { chamadas: 0, cacheHits: 0, recusasQuota: 0 };
  const observador: ObservadorContadores = {
    registrarChamada() {
      estado.chamadas += 1;
    },
    registrarCacheHit() {
      estado.cacheHits += 1;
    },
    registrarRecusaQuota() {
      estado.recusasQuota += 1;
    },
  };
  return {
    observador,
    get chamadas() {
      return estado.chamadas;
    },
    get cacheHits() {
      return estado.cacheHits;
    },
    get recusasQuota() {
      return estado.recusasQuota;
    },
  };
}

interface QuotaFake {
  quota: QuotaDeChamadas;
  consumidas: number;
}

function criarQuotaFake(limite = 1000): QuotaFake {
  let consumidas = 0;
  const quota: QuotaDeChamadas = {
    consumir() {
      if (consumidas >= limite) {
        return false;
      }
      consumidas += 1;
      return true;
    },
  };
  return {
    quota,
    get consumidas() {
      return consumidas;
    },
  };
}

function codigos(resultado: ResultadoVerificacao): string[] {
  return resultado.motivos.map((motivo) => motivo.codigo);
}

function motivo(resultado: ResultadoVerificacao, codigo: string): Motivo | undefined {
  return resultado.motivos.find((item) => item.codigo === codigo);
}

function identidadeConfig(api: ApiSemantica): InferenciaTextual {
  return { modelo: api.MODELO_OBSERVACAO, prompt_versao: api.versaoEfetivaDoPrompt() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lt-conferencia-vazio-cache-e-falhas", () => {
  it("observação vazia após trim não usa cache nem modelo e devolve nao_aplicavel", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: "   " });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    expect(resultado.decisao).toBe("OK");

    // Nenhum efeito colateral: zero leituras/gravações de KV, zero modelo e
    // zero consumo de quota.
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    expect(quota.consumidas).toBe(0);
  });

  it("hit válido de cache produz completa sem chamar o modelo nem consumir quota", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake({ [chaveDe(api, entrada)]: JSON.stringify(SINAIS_PARTICULAR) });
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));

    expect(kv.leituras).toBe(1);
    expect(kv.gravacoes).toBe(0);
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    expect(observador.cacheHits).toBe(1);
    expect(quota.consumidas).toBe(0);
  });

  it("miss válido faz uma chamada, grava os sinais validados e produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");

    expect(interpretador.chamadas).toHaveLength(1);
    expect(observador.chamadas).toBe(1);
    expect(observador.cacheHits).toBe(0);
    expect(quota.consumidas).toBe(1);
    expect(kv.gravacoes).toBe(1);

    const gravado = kv.armazem.get(chaveDe(api, entrada));
    expect(typeof gravado).toBe("string");
    expect(JSON.parse(gravado as string)).toEqual(SINAIS_PARTICULAR);
  });

  it("preserva o texto CRU na chave de cache (trim só serve para vazio e limite)", async () => {
    const api = exigirSemantica();

    const textoCru = `  ${TEXTO_PARTICULAR}  `;
    const guia = guiaSintetica({ observacao_recepcao: textoCru });
    const catalogo = catalogoValido();
    const crua: EntradaObservacao = {
      observacao_recepcao: textoCru,
      convenio: guia.convenio,
      procedimento_codigo: guia.procedimentoCodigo,
    };
    const trimada: EntradaObservacao = { ...crua, observacao_recepcao: textoCru.trim() };
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    // A chave gravada usa o texto com os espaços; não a versão trimada.
    const gravado = [...kv.armazem.keys()];
    expect(gravado).toEqual([chaveDe(api, crua)]);
    expect(chaveDe(api, crua)).not.toBe(chaveDe(api, trimada));

    // O payload entregue ao provedor também preserva o texto CRU
    // (julgamento `texto_na_chave_e_payload`): trim serve só para vazio/limite.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.chamadas[0].observacao_recepcao).toBe(textoCru);
  });

  it("leitura de KV que lança é miss e a extração válida seguinte produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    kv.falharLeitura(new Error("KV fora do ar na leitura"));
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).not.toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("gravação de KV que lança segue sem persistir e ainda produz completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    kv.falharGravacao(new Error("KV fora do ar na gravação"));
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    expect(kv.tentativasGravacao).toBe(1);
    expect(kv.gravacoes).toBe(0);
    expect(kv.armazem.size).toBe(0);
  });

  it("cache corrompido é miss e a reextração válida sobrescreve com completa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const entrada = entradaDe(guia);
    const kv = criarKvFake({ [chaveDe(api, entrada)]: "{ isto não é JSON válido" });
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).not.toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.gravacoes).toBe(1);
    expect(JSON.parse(kv.armazem.get(chaveDe(api, entrada)) as string)).toEqual(SINAIS_PARTICULAR);
  });

  it("erro do modelo fechado como não transitório produz PENDENTE/incompleta preservando o achado estruturado", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([new Error("provedor indisponível")]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    // Achado determinístico preservado, não substituído.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // Houve tentativa, então a inferência é identificada.
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    // A checagem incompleta não sobrescreve a regra estruturada.
    expect(codigos(resultado)).toEqual(["autorizacao_vencida", "checagem_textual_incompleta"]);
  });

  it("timeout local produz PENDENTE/incompleta sem retentativa e sem sobreposição", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake(["pendente"]);

    vi.useFakeTimers();

    const promessa = api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      timeoutMs: TIMEOUT_PADRAO_MS,
      agora: () => Date.now(),
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS);
    const resultado = await promessa;

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));

    // Uma tentativa abandonada por timeout nunca dispara nova chamada.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(interpretador.maxEmVoo()).toBe(1);
    expect(interpretador.eventos).toEqual(["inicio:1"]);
  });

  it("configuração ausente produz PENDENTE/incompleta sem tentativa", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: null,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toBeNull();
    expect(kv.gravacoes).toBe(0);
  });

  it("schema inválido produz PENDENTE/incompleta com tentativa registrada", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const responseInvalida: RespostaBruta = {
      texto: JSON.stringify({ sinais: "não é uma lista", campo_desconhecido: true }),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([responseInvalida]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(kv.gravacoes).toBe(0);
    // O achado estruturado continua preservado.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("evidência não literal produz PENDENTE/incompleta e não grava cache", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const responseInventada: RespostaBruta = {
      texto: JSON.stringify({
        sinais: [{ tipo: "decisao_por_particular", evidencia: "trecho inventado pelo modelo" }],
        situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
        ambiguidades: [],
      }),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([responseInventada]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.inferencia_textual).toEqual(identidadeConfig(api));
    expect(kv.gravacoes).toBe(0);
  });

  it("quota recusada não chama o modelo e produz incompleta com limitações nomeadas", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const observador = criarObservadorFake();
    // A quota real é esgotada antes da conferência; a próxima tentativa é recusada.
    const quotaReal = api.criarQuotaDeChamadas({ limite: 1, observador: observador.observador });
    expect(quotaReal.consumir()).toBe(true);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quotaReal,
      observador: observador.observador,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("quota_de_chamadas_excedida");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    // Recusa antes da chamada: zero chamadas e nenhuma tentativa registrada.
    expect(interpretador.chamadas).toHaveLength(0);
    expect(observador.chamadas).toBe(0);
    expect(observador.recusasQuota).toBe(1);
    expect(resultado.inferencia_textual).toBeNull();
    // Os achados determinísticos já calculados continuam preservados.
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("observação acima de 1000 caracteres não é enviada e produz incompleta", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({
      observacao_recepcao: "a".repeat(LIMITE_ENTRADA + 1),
      autorizacao_validade: "2026-08-09",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(resultado.limitacoes).toContain("observacao_acima_do_limite");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(0);
    expect(resultado.inferencia_textual).toBeNull();
    expect(motivo(resultado, "autorizacao_vencida")).toBeDefined();
  });

  it("limite de entrada usa o texto trimado: 1000 aceito, 1001 recusado e 1000 espaços + letra enviados", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const aceito = guiaSintetica({ observacao_recepcao: "a".repeat(LIMITE_ENTRADA) });
    const kvAceito = criarKvFake();
    const interpretadorAceito = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    const resultadoAceito = await api.conferirGuia(aceito, catalogo, {
      interpretador: interpretadorAceito.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvAceito.kv),
    });
    expect(resultadoAceito.checagem_textual).toBe("completa");
    expect(interpretadorAceito.chamadas).toHaveLength(1);

    // 1000 espaços + uma letra: o comprimento trimado é 1, então é enviado.
    const comEspacos = guiaSintetica({
      observacao_recepcao: `${" ".repeat(LIMITE_ENTRADA)}a`,
    });
    const kvEspacos = criarKvFake();
    const interpretadorEspacos = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    const resultadoEspacos = await api.conferirGuia(comEspacos, catalogo, {
      interpretador: interpretadorEspacos.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvEspacos.kv),
    });
    expect(resultadoEspacos.checagem_textual).toBe("completa");
    expect(interpretadorEspacos.chamadas).toHaveLength(1);

    const recusado = guiaSintetica({ observacao_recepcao: "a".repeat(LIMITE_ENTRADA + 1) });
    const kvRecusado = criarKvFake();
    const interpretadorRecusado = criarInterpretadorFake([resposta(api, SINAIS_NEUTROS)]);
    await api.conferirGuia(recusado, catalogo, {
      interpretador: interpretadorRecusado.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvRecusado.kv),
    });
    expect(interpretadorRecusado.chamadas).toHaveLength(0);
  });
});

describe("lt-retentativa-timeout-e-limites", () => {
  it("primeira tentativa 429 e segunda válida termina completa, sequencial e com duas quotas", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const quota = criarQuotaFake();
    const observador = criarObservadorFake();
    const erroTransitorio = Object.assign(new Error("muitas requisições"), { status: 429 });
    const interpretador = criarInterpretadorFake([
      erroTransitorio,
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const classificados: unknown[] = [];
    const classificarFalha = (erro: unknown): ClassificacaoFalha => {
      classificados.push(erro);
      const status = (erro as { status?: number } | null)?.status;
      return status === 429 || (typeof status === "number" && status >= 500)
        ? "transporte"
        : "nao_transitorio";
    };

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
      quota: quota.quota,
      observador: observador.observador,
      classificarFalha,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(codigos(resultado)).toContain("modalidade_particular_contraditoria");
    // Duas tentativas consumidas: duas chamadas e duas quotas.
    expect(interpretador.chamadas).toHaveLength(2);
    expect(observador.chamadas).toBe(2);
    expect(quota.consumidas).toBe(2);
    // Estritamente sequencial: início/fim de cada tentativa sem sobreposição.
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1", "inicio:2", "fim:2"]);
    expect(interpretador.maxEmVoo()).toBe(1);
    // O classificador injetado foi de fato consultado.
    expect(classificados).toHaveLength(1);
    expect(classificados[0]).toBe(erroTransitorio);
  });

  it("primeira tentativa 5xx com o classificador padrão também retenta uma única vez", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([
      Object.assign(new Error("serviço indisponível"), { status: 503 }),
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.checagem_textual).toBe("completa");
    expect(interpretador.chamadas).toHaveLength(2);
    expect(interpretador.eventos).toEqual(["inicio:1", "fim:1", "inicio:2", "fim:2"]);
  });

  it("duas falhas transitórias terminam incompletas sem terceira chamada", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const cache = api.criarAdaptadorCacheSemantico(kv.kv);
    const interpretador = criarInterpretadorFake([
      Object.assign(new Error("indisponível"), { status: 500 }),
      Object.assign(new Error("indisponível"), { status: 502 }),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache,
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    // No máximo uma retentativa: exatamente duas chamadas, nunca três.
    expect(interpretador.chamadas).toHaveLength(2);
    expect(interpretador.maxEmVoo()).toBe(1);
  });

  it("status não transitório (400/403) não retenta", async () => {
    const api = exigirSemantica();

    for (const status of [400, 403]) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
      const catalogo = catalogoValido();
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([
        Object.assign(new Error("recusado"), { status }),
        resposta(api, SINAIS_PARTICULAR),
      ]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.checagem_textual, `status ${status}`).toBe("incompleta");
      expect(interpretador.chamadas, `status ${status}`).toHaveLength(1);
    }
  });

  it("erro desconhecido sem status não retenta", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([
      new Error("falha sem status"),
      resposta(api, SINAIS_PARTICULAR),
    ]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("schema e evidência inválidos não retentam", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const casos: RespostaBruta[] = [
      {
        texto: JSON.stringify({ sinais: 1 }),
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      },
      {
        texto: JSON.stringify({
          sinais: [{ tipo: "decisao_por_particular", evidencia: "citação inexistente no texto" }],
          situacao: { ...SITUACAO_NEUTRA, modalidade: "particular_decidido" },
          ambiguidades: [],
        }),
        modelo: api.MODELO_OBSERVACAO,
        promptVersao: api.versaoEfetivaDoPrompt(),
      },
    ];

    for (const respostaInvalida of casos) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([
        respostaInvalida,
        resposta(api, SINAIS_PARTICULAR),
      ]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.checagem_textual).toBe("incompleta");
      expect(interpretador.chamadas).toHaveLength(1);
    }
  });

  it("convênio ou procedimento acima de 200 caracteres não é enviado e produz incompleta", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const convenioLongo = `C${"x".repeat(200)}`;
    const procedimentoLongo = `9${"8".repeat(200)}`;
    // Valores sem espaços nas pontas: comprimento cru coincide com o trimado.
    expect(convenioLongo).toHaveLength(201);
    expect(procedimentoLongo).toHaveLength(201);

    const casos: Array<Partial<Record<Coluna, string>>> = [
      { convenio: convenioLongo },
      { procedimento_codigo: procedimentoLongo },
    ];

    for (const overrides of casos) {
      const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN, ...overrides });
      const kv = criarKvFake();
      const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

      const resultado = await api.conferirGuia(guia, catalogo, {
        interpretador: interpretador.interpretador,
        cache: api.criarAdaptadorCacheSemantico(kv.kv),
      });

      expect(resultado.decisao).toBe("PENDENTE");
      expect(resultado.checagem_textual).toBe("incompleta");
      expect(interpretador.chamadas).toHaveLength(0);
      expect(resultado.inferencia_textual).toBeNull();
    }
  });

  it("convênio com exatamente 200 caracteres não é bloqueado pelo teto de entrada", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const convenioLimite = `C${"x".repeat(199)}`;
    expect(convenioLimite).toHaveLength(200);

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_ADMIN,
      convenio: convenioLimite,
    });
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]);

    await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    // O teto não bloqueia o valor de exatamente 200: a extração é tentada
    // (motivos estruturados podem existir por convênio não catalogado, então
    // só a invocação é afirmada).
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("resposta acima de 16 KiB é rejeitada antes do parse, sem retentativa e sem cache", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const grande: RespostaBruta = {
      texto: "x".repeat(LIMITE_RESPOSTA_BYTES + 1),
      modelo: api.MODELO_OBSERVACAO,
      promptVersao: api.versaoEfetivaDoPrompt(),
    };
    const interpretador = criarInterpretadorFake([grande, resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    // Rejeitada por limite (não transitória): uma chamada e nenhuma gravação.
    expect(interpretador.chamadas).toHaveLength(1);
    expect(kv.gravacoes).toBe(0);
  });
});

describe("lt-jornadas-administrativa-particular-falha", () => {
  it("guia administrativa limpa fica OK/completa com extração válida e PENDENTE/incompleta sob falha", async () => {
    const api = exigirSemantica();
    const catalogo = catalogoValido();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN });

    const kvOk = criarKvFake();
    const comSucesso = await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([resposta(api, SINAIS_ADMIN)]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvOk.kv),
    });

    expect(comSucesso.decisao).toBe("OK");
    expect(comSucesso.checagem_textual).toBe("completa");
    expect(comSucesso.motivos).toEqual([]);
    expect(comSucesso.inferencia_textual).toEqual(identidadeConfig(api));

    // A mesma guia sob erro simulado passa de OK para PENDENTE (fail-closed).
    const kvErro = criarKvFake();
    const comErro = await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([new Error("indisponível")]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kvErro.kv),
    });

    expect(comErro.decisao).toBe("PENDENTE");
    expect(comErro.checagem_textual).toBe("incompleta");
    expect(codigos(comErro)).toEqual(["checagem_textual_incompleta"]);
    expect(comErro.limitacoes).toContain("checagem_textual_incompleta");
    expect(comErro.inferencia_textual).toEqual(identidadeConfig(api));
  });

  it("guia administrativa limpa sob timeout fica PENDENTE/incompleta com limitação visível", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_ADMIN });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake(["pendente"]);

    vi.useFakeTimers();

    const promessa = api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      timeoutMs: TIMEOUT_PADRAO_MS,
      agora: () => Date.now(),
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_PADRAO_MS);
    const resultado = await promessa;

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("incompleta");
    expect(codigos(resultado)).toContain("checagem_textual_incompleta");
    expect(resultado.limitacoes).toContain("checagem_textual_incompleta");
    expect(interpretador.chamadas).toHaveLength(1);
  });

  it("decisão por particular retorna PENDENTE por modalidade_particular_contraditoria", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: TEXTO_PARTICULAR });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.decisao).toBe("PENDENTE");
    expect(resultado.checagem_textual).toBe("completa");
    expect(motivo(resultado, "modalidade_particular_contraditoria")).toBeDefined();
    expect(resultado.limitacoes).not.toContain("checagem_textual_incompleta");
  });

  it("observação vazia mantém zero chamadas ao modelo", async () => {
    const api = exigirSemantica();

    const guia = guiaSintetica({ observacao_recepcao: "" });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const interpretador = criarInterpretadorFake([]);

    const resultado = await api.conferirGuia(guia, catalogo, {
      interpretador: interpretador.interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
    });

    expect(resultado.checagem_textual).toBe("nao_aplicavel");
    expect(resultado.inferencia_textual).toBeNull();
    expect(interpretador.chamadas).toHaveLength(0);
    expect(kv.leituras).toBe(0);
    expect(kv.gravacoes).toBe(0);
  });

  it("eventos redigidos não carregam observação nem identificadores e usam o vocabulário fechado", async () => {
    const api = exigirSemantica();

    const VOCABULARIO_FECHADO = new Set([
      "extracao_iniciada",
      "extracao_concluida",
      "extracao_falhou",
      "cache_leitura_falhou",
      "cache_gravacao_falhou",
      "quota_recusada",
      "conferencia_iniciada",
      "conferencia_concluida",
      "conferencia_falhou",
    ]);
    const CHAVES_PERMITIDAS = new Set([
      "evento",
      "estado",
      "codigo",
      "cache_prefixo",
      "duracao_ms",
      "tentativas",
      "itens",
    ]);

    const guia = guiaSintetica({
      observacao_recepcao: TEXTO_PARTICULAR,
      id_guia: "SYN-SEGREDO-9999",
      paciente: "PACIENTE-MARCADOR",
      numero_autorizacao: "AUT-MARCADOR",
    });
    const catalogo = catalogoValido();
    const kv = criarKvFake();
    const capturados: EventoRedigido[] = [];
    const registrador = api.criarRegistradorRedigido((evento) => {
      capturados.push(evento);
    });

    const espioes = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];

    await api.conferirGuia(guia, catalogo, {
      interpretador: criarInterpretadorFake([resposta(api, SINAIS_PARTICULAR)]).interpretador,
      cache: api.criarAdaptadorCacheSemantico(kv.kv),
      registrador,
    });

    // Somente chaves e nomes de evento pertencentes aos vocabulários fechados.
    for (const evento of capturados) {
      expect(VOCABULARIO_FECHADO.has(evento.evento)).toBe(true);
      for (const chave of Object.keys(evento)) {
        expect(CHAVES_PERMITIDAS.has(chave)).toBe(true);
      }
    }

    // Nenhum corpo/identificador sensível aparece nos eventos emitidos.
    const serializado = JSON.stringify(capturados);
    expect(serializado).not.toContain(TEXTO_PARTICULAR);
    expect(serializado).not.toContain("SYN-SEGREDO-9999");
    expect(serializado).not.toContain("PACIENTE-MARCADOR");
    expect(serializado).not.toContain("AUT-MARCADOR");

    // Nenhum `console.*` direto é chamado pelo núcleo.
    for (const espiao of espioes) {
      expect(espiao).not.toHaveBeenCalled();
    }
  });
});
