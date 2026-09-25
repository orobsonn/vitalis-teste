// Testes travados da task-4-cache-semantico (feature
// semantic-observation-interpretation):
//   lt-chave-cache-modelo-prompt-conteudo — a chave `semantico:v1:` é o sha256
//                                           do JSON canônico de
//                                           `{ texto, convenio, procedimento_codigo,
//                                           prompt_versao, prompt_hash, modelo }`;
//                                           trocar modelo, versão ou hash/conteúdo
//                                           do prompt invalida a chave, entrada
//                                           idêntica reproduz o mesmo sha256 e o
//                                           prefixo observável tem no máximo 12 hex
//                                           (#ac-13, §3.8, §3.10);
//   lt-cache-corrompido-ou-indisponivel  — toda leitura revalida schema/evidência:
//                                           valor ilegível, schema inválido,
//                                           evidência não literal ou exceção de
//                                           leitura resultam em miss; uma resposta
//                                           válida sobrescreve com `expirationTtl`
//                                           padrão 86400 (ou configurado); falha de
//                                           gravação segue sem persistência e nenhuma
//                                           falha isolada do adaptador lança exceção
//                                           fatal (#ac-22, #ac-23, §3.8).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// `src/semantic/cache.ts` e as exportações do cache ainda não existem: a falha é
// de asserção no primeiro `expect` de cada caso, nunca de coleta/import. O KV é
// substituído por um fake estrutural (`get`/`put`/`delete`) que registra cada
// `put`, inclusive `options.expirationTtl`; `sha256Hex` e `textoCanonico` entram
// por glob de `src/shared` para que a chave esperada seja calculada no teste, e
// não hardcoded.
import { describe, expect, it, vi } from "vitest";

interface EntradaObservacao {
  observacao_recepcao: string;
  convenio: string;
  procedimento_codigo: string;
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
  autorizacao: string;
  modalidade: string;
  procedimento: string;
  reagendamento: string;
}

interface SinaisObservacao {
  sinais: Sinal[];
  situacao: SituacaoTextual;
  ambiguidades: Ambiguidade[];
}

// Contexto de inferência da chave: modelo efetivo, constante de versão do prompt
// e sha256 do conteúdo do prompt (invalidação por conteúdo, §3.8/§3.1).
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

interface CacheKv {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: OpcoesPut): Promise<void>;
  delete(chave: string): Promise<void>;
}

// Evento capturado do registrador injetado no adaptador: o par `(evento, campos)`
// exatamente como a implementação o entrega, sem passar pelo registrador redigido.
interface ChamadaRegistrador {
  evento: string;
  campos: Record<string, unknown>;
}

// Forma mínima do registrador redigido consumida pelo adaptador (§3.10).
interface RegistradorLocal {
  info(evento: string, campos: Record<string, unknown>): void;
}

// Evento já redigido entregue pelo registrador real do barrel.
interface EventoRedigidoLocal {
  evento: string;
  estado?: string;
  codigo?: string;
  cache_prefixo?: string;
}

interface OpcoesAdaptadorCacheSemantico {
  ttlSegundos?: number;
  registrador?: RegistradorLocal;
}

interface AdaptadorCacheSemantico {
  ler(entrada: EntradaObservacao, contexto: ContextoCache): Promise<SinaisObservacao | null>;
  gravar(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
    sinais: SinaisObservacao,
  ): Promise<void>;
}

interface ApiAprovada {
  montarChaveCacheSemantica(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
  ): ChaveCacheSemantica;
  criarAdaptadorCacheSemantico(
    kv: CacheKv,
    opcoes?: OpcoesAdaptadorCacheSemantico,
  ): AdaptadorCacheSemantico;
  criarRegistradorRedigido(destino: (evento: EventoRedigidoLocal) => void): RegistradorLocal;
  LIMITE_VALOR_CACHE_BYTES?: number;
}

interface ApiCanonica {
  textoCanonico(valor: unknown, profundidade?: number): string;
}

interface ApiSha {
  sha256Hex(texto: string): string;
}

const modulosBarrel = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada | undefined;

const modulosCanonica = import.meta.glob("../../src/shared/json-canonico.ts", { eager: true });
const canonica = Object.values(modulosCanonica)[0] as unknown as ApiCanonica | undefined;

const modulosSha = import.meta.glob("../../src/shared/sha256.ts", { eager: true });
const sha = Object.values(modulosSha)[0] as unknown as ApiSha | undefined;

const PREFIXO_NAMESPACE = "semantico:v1:";
const TTL_PADRAO_SEGUNDOS = 86400;
const MODELO_BASE = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MODELO_ALTERNATIVO = "@cf/meta/llama-3.1-8b-instruct";
const VERSAO_BASE = "observacao-v1";
const VERSAO_ALTERNATIVA = "observacao-v2";
const TEXTO_OBSERVACAO = "Autorização nova não cadastrada informada pela operadora.";
const TEXTO_PROMPT_BASE = "Prompt canônico de observação v1.";

const ENTRADA: EntradaObservacao = {
  observacao_recepcao: TEXTO_OBSERVACAO,
  convenio: "unimed",
  procedimento_codigo: "40901114",
};

const BASE: ContextoCache = {
  modelo: MODELO_BASE,
  promptVersao: VERSAO_BASE,
  promptHash: sha?.sha256Hex(TEXTO_PROMPT_BASE) ?? "",
};

const SITUACAO_NEUTRA: SituacaoTextual = {
  autorizacao: "nenhuma",
  modalidade: "nenhuma",
  procedimento: "nenhuma",
  reagendamento: "nenhum",
};

// Extração válida: evidência literal presente na observação e situação coerente.
const SINAIS_VALIDOS: SinaisObservacao = {
  sinais: [{ tipo: "nota_administrativa", evidencia: "informada pela operadora" }],
  situacao: SITUACAO_NEUTRA,
  ambiguidades: [],
};

interface Gravacao {
  chave: string;
  valor: string;
  opcoes?: OpcoesPut;
}

interface KvFake {
  kv: CacheKv;
  armazem: Map<string, string>;
  gravacoes: Gravacao[];
  falharLeitura(erro?: unknown): void;
  falharGravacao(erro?: unknown): void;
}

// KV fake estrutural: registra cada `put` com suas opções (TTL) e pode ser
// configurado para lançar na leitura ou na gravação, como um KV indisponível.
function criarKvFake(inicial: Record<string, string> = {}): KvFake {
  const armazem = new Map<string, string>(Object.entries(inicial));
  const gravacoes: Gravacao[] = [];
  let erroLeitura: unknown = null;
  let erroGravacao: unknown = null;

  const kv: CacheKv = {
    async get(chave) {
      if (erroLeitura) {
        throw erroLeitura;
      }
      return armazem.get(chave) ?? null;
    },
    async put(chave, valor, opcoes) {
      if (erroGravacao) {
        throw erroGravacao;
      }
      gravacoes.push({ chave, valor, opcoes });
      armazem.set(chave, valor);
    },
    async delete(chave) {
      armazem.delete(chave);
    },
  };

  return {
    kv,
    armazem,
    gravacoes,
    falharLeitura(erro = new Error("KV indisponível na leitura")) {
      erroLeitura = erro;
    },
    falharGravacao(erro = new Error("KV indisponível na gravação")) {
      erroGravacao = erro;
    },
  };
}

function chaveDe(entrada: EntradaObservacao, contexto: ContextoCache): string {
  return api!.montarChaveCacheSemantica!(entrada, contexto).chave;
}

// Chave esperada calculada no teste a partir do JSON canônico exato de §3.8.
function chaveCanonicaEsperada(entrada: EntradaObservacao, contexto: ContextoCache): string {
  const canonico = canonica!.textoCanonico({
    texto: entrada.observacao_recepcao,
    convenio: entrada.convenio,
    procedimento_codigo: entrada.procedimento_codigo,
    prompt_versao: contexto.promptVersao,
    prompt_hash: contexto.promptHash,
    modelo: contexto.modelo,
  });
  return `${PREFIXO_NAMESPACE}${sha!.sha256Hex(canonico)}`;
}

// Observa se uma ação assíncrona lançou, sem acoplar o teste ao tipo de retorno.
async function semLancar(acao: () => Promise<unknown>): Promise<boolean> {
  try {
    await acao();
    return false;
  } catch {
    return true;
  }
}

describe("lt-chave-cache-modelo-prompt-conteudo", () => {
  it("deriva a chave do sha256 do JSON canônico sob o namespace semantico:v1:", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const resultado = api!.montarChaveCacheSemantica!(ENTRADA, BASE);
    const esperado = chaveCanonicaEsperada(ENTRADA, BASE);

    // A chave é o sha256 calculado no teste sobre o JSON canônico de §3.8.
    expect(resultado.chave).toBe(esperado);
    expect(resultado.chave.startsWith(PREFIXO_NAMESPACE)).toBe(true);

    // O prefixo observável é hex e tem no máximo 12 caracteres (§3.10).
    const digest = resultado.chave.slice(PREFIXO_NAMESPACE.length);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(resultado.prefixo).toMatch(/^[0-9a-f]{1,12}$/);
    expect(esperado.startsWith(`${PREFIXO_NAMESPACE}${resultado.prefixo}`)).toBe(true);
  });

  it("reproduz a mesma chave para entrada idêntica, mesmo com ordem de campos diferente", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const entradaReordenada: EntradaObservacao = {
      procedimento_codigo: ENTRADA.procedimento_codigo,
      convenio: ENTRADA.convenio,
      observacao_recepcao: ENTRADA.observacao_recepcao,
    };

    expect(chaveDe(entradaReordenada, BASE)).toBe(chaveCanonicaEsperada(ENTRADA, BASE));
    expect(chaveDe(ENTRADA, BASE)).toBe(chaveDe({ ...ENTRADA }, { ...BASE }));
  });

  it("muda a chave quando somente o modelo muda", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const base = chaveDe(ENTRADA, BASE);
    const alterado = chaveDe(ENTRADA, { ...BASE, modelo: MODELO_ALTERNATIVO });

    expect(alterado).not.toBe(base);
    expect(alterado.startsWith(PREFIXO_NAMESPACE)).toBe(true);
  });

  it("muda a chave quando somente a versão do prompt muda", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const base = chaveDe(ENTRADA, BASE);
    const alterado = chaveDe(ENTRADA, { ...BASE, promptVersao: VERSAO_ALTERNATIVA });

    expect(alterado).not.toBe(base);
  });

  it("muda a chave quando somente o conteúdo (hash) do prompt muda", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const hashNovo = sha?.sha256Hex("Prompt canônico de observação v2 (conteúdo novo).") ?? "";
    expect(hashNovo).not.toBe(BASE.promptHash);

    const base = chaveDe(ENTRADA, BASE);
    const alterado = chaveDe(ENTRADA, { ...BASE, promptHash: hashNovo });

    expect(alterado).not.toBe(base);
  });

  it("muda a chave quando somente o texto da observação muda", () => {
    expect(typeof api?.montarChaveCacheSemantica).toBe("function");

    const base = chaveDe(ENTRADA, BASE);
    const alterado = chaveDe(
      { ...ENTRADA, observacao_recepcao: "Outro relato administrativo da recepção." },
      BASE,
    );

    expect(alterado).not.toBe(base);
  });
});

describe("lt-cache-corrompido-ou-indisponivel", () => {
  it("grava a resposta validada na chave versionada com TTL padrão de 86400 s", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, armazem, gravacoes } = criarKvFake();
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    await cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS);

    // Uma única gravação, na chave derivada, com o TTL padrão de 24 h.
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].chave).toBe(chaveCanonicaEsperada(ENTRADA, BASE));
    expect(gravacoes[0].opcoes?.expirationTtl).toBe(TTL_PADRAO_SEGUNDOS);

    // O valor é o JSON da resposta validada e a leitura subsequente é hit.
    const persistido = armazem.get(chaveCanonicaEsperada(ENTRADA, BASE));
    expect(typeof persistido).toBe("string");
    expect(JSON.parse(persistido as string)).toEqual(SINAIS_VALIDOS);
    expect(await cache.ler(ENTRADA, BASE)).toEqual(SINAIS_VALIDOS);
  });

  it("honra o TTL configurado no adaptador KV", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, gravacoes } = criarKvFake();
    const cache = api!.criarAdaptadorCacheSemantico!(kv, { ttlSegundos: 3600 });

    await cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].opcoes?.expirationTtl).toBe(3600);
    expect(gravacoes[0].opcoes?.expirationTtl).not.toBe(TTL_PADRAO_SEGUNDOS);
  });

  it("retorna hit para um valor válido já persistido", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: JSON.stringify(SINAIS_VALIDOS) });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toEqual(SINAIS_VALIDOS);
  });

  it("trata JSON ilegível como miss após revalidação", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: "{ isto não é JSON válido" });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toBeNull();
  });

  it("trata schema inválido como miss após revalidação", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const valorForaDoSchema = JSON.stringify({ sinais: "não é uma lista", extra: true });
    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: valorForaDoSchema });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toBeNull();
  });

  it("trata evidência não literal como miss após revalidação", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const evidenciaInventada = JSON.stringify({
      sinais: [
        { tipo: "nota_administrativa", evidencia: "trecho que não consta do texto observado" },
      ],
      situacao: SITUACAO_NEUTRA,
      ambiguidades: [],
    });
    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: evidenciaInventada });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toBeNull();
  });

  it("trata exceção de leitura como miss, sem exceção fatal", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, falharLeitura } = criarKvFake();
    falharLeitura(new Error("KV fora do ar na leitura"));
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();
  });

  it("sobrescreve uma entrada corrompida com uma nova resposta válida", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, gravacoes } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: "valor corrompido" });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    // A leitura corrompida é miss e a nova resposta válida sobrescreve a entrada.
    expect(await cache.ler(ENTRADA, BASE)).toBeNull();
    await cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].opcoes?.expirationTtl).toBe(TTL_PADRAO_SEGUNDOS);
    expect(await cache.ler(ENTRADA, BASE)).toEqual(SINAIS_VALIDOS);
  });

  it("mantém o fluxo sem persistência quando a gravação falha, sem exceção fatal", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, armazem, falharGravacao } = criarKvFake();
    falharGravacao(new Error("KV fora do ar na gravação"));
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    const lancou = await semLancar(() => cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS));

    expect(lancou).toBe(false);
    expect(armazem.size).toBe(0);
    expect(await cache.ler(ENTRADA, BASE)).toBeNull();
  });
});

// Cobertura das duas correções aprovadas após a revisão final:
//   1. o adaptador recebe um `registrador` injetável e emite UM evento redigido
//      (`cache_leitura_falhou` / `cache_gravacao_falhou`) quando o KV lança;
//   2. toda leitura rejeita, ANTES do `JSON.parse`, qualquer valor cujo UTF-8
//      exceda `LIMITE_VALOR_CACHE_BYTES` (16 KiB, §3.9).
const LIMITE_VALOR_CACHE_BYTES_ESPERADO = 16384;
const CODIFICADOR_UTF8 = new TextEncoder();

function bytesUtf8(texto: string): number {
  return CODIFICADOR_UTF8.encode(texto).length;
}

function prefixoDe(entrada: EntradaObservacao, contexto: ContextoCache): string {
  return api!.montarChaveCacheSemantica!(entrada, contexto).prefixo;
}

// Registrador local que captura cada `(evento, campos)` exatamente como passado
// pelo adaptador, sem passar pelo registrador redigido real.
function criarRegistradorCaptura(): {
  registrador: RegistradorLocal;
  chamadas: ChamadaRegistrador[];
} {
  const chamadas: ChamadaRegistrador[] = [];
  const registrador: RegistradorLocal = {
    info(evento, campos) {
      chamadas.push({ evento, campos });
    },
  };
  return { registrador, chamadas };
}

const CAMPOS_ESPERADOS_FALHA_KV: readonly string[] = [
  "estado",
  "codigo",
  "cache_prefixo",
];

// Confere o evento de falha de KV: nome, classificação estável, estado fechado,
// prefixo derivado (1..12 hex) e ausência de qualquer chave fora da allowlist.
function conferirEventoFalhaKv(
  capturado: ChamadaRegistrador,
  eventoEsperado: string,
  entrada: EntradaObservacao,
  contexto: ContextoCache,
): void {
  expect(capturado.evento).toBe(eventoEsperado);
  expect(capturado.campos.codigo).toBe("cache_indisponivel");
  expect(capturado.campos.estado).toBe("incompleta");
  expect(capturado.campos.cache_prefixo).toBe(prefixoDe(entrada, contexto));
  expect(capturado.campos.cache_prefixo).toMatch(/^[0-9a-f]{1,12}$/);

  for (const chave of Object.keys(capturado.campos)) {
    expect(CAMPOS_ESPERADOS_FALHA_KV).toContain(chave);
  }
}

describe("registrador-redigido-nas-falhas-de-kv", () => {
  it("emite um único cache_leitura_falhou redigido quando kv.get lança", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const mensagemCrua = "KV fora do ar na leitura — detalhe interno 98765";
    const { kv, falharLeitura } = criarKvFake();
    falharLeitura(new Error(mensagemCrua));

    const { registrador, chamadas } = criarRegistradorCaptura();
    const cache = api!.criarAdaptadorCacheSemantico!(kv, { registrador });

    await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();

    // Exatamente um evento redigido, com os campos de §3.10.
    expect(chamadas).toHaveLength(1);
    conferirEventoFalhaKv(chamadas[0], "cache_leitura_falhou", ENTRADA, BASE);

    // Nada cru atravessa: nem a mensagem do erro, nem a chave completa, nem o
    // texto livre da observação.
    const serializado = JSON.stringify(chamadas[0]);
    expect(serializado).not.toContain(mensagemCrua);
    expect(serializado).not.toContain(chaveDe(ENTRADA, BASE));
    expect(serializado).not.toContain(ENTRADA.observacao_recepcao);
  });

  it("emite um único cache_gravacao_falhou redigido quando kv.put lança", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const mensagemCrua = "KV fora do ar na gravação — detalhe interno 55555";
    const { kv, armazem, falharGravacao } = criarKvFake();
    falharGravacao(new Error(mensagemCrua));

    const { registrador, chamadas } = criarRegistradorCaptura();
    const cache = api!.criarAdaptadorCacheSemantico!(kv, { registrador });

    const lancou = await semLancar(() => cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS));

    expect(lancou).toBe(false);
    expect(armazem.size).toBe(0);
    expect(chamadas).toHaveLength(1);
    conferirEventoFalhaKv(chamadas[0], "cache_gravacao_falhou", ENTRADA, BASE);

    const serializado = JSON.stringify(chamadas[0]);
    expect(serializado).not.toContain(mensagemCrua);
    expect(serializado).not.toContain(chaveDe(ENTRADA, BASE));
    expect(serializado).not.toContain(ENTRADA.observacao_recepcao);
  });

  it("o registrador real do barrel redige o evento à allowlist fechada de §3.10", async () => {
    expect(typeof api?.criarRegistradorRedigido).toBe("function");
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const eventos: EventoRedigidoLocal[] = [];
    const registrador = api!.criarRegistradorRedigido!((evento) => eventos.push(evento));

    const { kv, falharLeitura } = criarKvFake();
    falharLeitura(new Error("falha crua que não pode vazar: 4242"));

    const cache = api!.criarAdaptadorCacheSemantico!(kv, { registrador });
    await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();

    expect(eventos).toHaveLength(1);
    const evento = eventos[0];
    expect(evento.evento).toBe("cache_leitura_falhou");
    expect(evento.codigo).toBe("cache_indisponivel");
    expect(evento.estado).toBe("incompleta");
    expect(evento.cache_prefixo).toMatch(/^[0-9a-f]{1,12}$/);
    expect((evento.cache_prefixo ?? "").length).toBeLessThanOrEqual(12);
    for (const chave of Object.keys(evento)) {
      expect(["evento", "estado", "codigo", "cache_prefixo"]).toContain(chave);
    }
  });
});

describe("teto-de-bytes-do-valor-de-cache", () => {
  // Array numérico longo e válido como JSON: > 16 KiB, para forçar o teto.
  const GIGANTE = JSON.stringify(
    Array.from({ length: 20000 }, (_, indice) => indice % 10),
  );

  it("expõe LIMITE_VALOR_CACHE_BYTES igual a 16384 (16 KiB)", () => {
    expect(typeof api?.LIMITE_VALOR_CACHE_BYTES).toBe("number");
    expect(api!.LIMITE_VALOR_CACHE_BYTES).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);
  });

  it("trata valor acima do teto como miss sem chamar JSON.parse", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");
    expect(api!.LIMITE_VALOR_CACHE_BYTES).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    expect(bytesUtf8(GIGANTE)).toBeGreaterThan(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: GIGANTE });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    const espiao = vi.spyOn(JSON, "parse");
    try {
      await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();
      // O teto é verificado antes do parse: o valor gigante nunca chega ao JSON.
      expect(espiao.mock.calls.map((chamada) => chamada[0])).not.toContain(GIGANTE);
      expect(espiao).not.toHaveBeenCalled();
    } finally {
      espiao.mockRestore();
    }
  });

  it("rejeita valor acima do teto sem materializar/codificar o valor inteiro", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");
    expect(api!.LIMITE_VALOR_CACHE_BYTES).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    expect(bytesUtf8(GIGANTE)).toBeGreaterThan(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: GIGANTE });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    // A guarda não pode codificar o valor gigante para descobrir que ele é
    // excessivo: isso negaria o propósito do teto (§3.9).
    const espiaoEncode = vi.spyOn(TextEncoder.prototype, "encode");
    try {
      await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();
      expect(espiaoEncode.mock.calls.map((chamada) => chamada[0])).not.toContain(GIGANTE);
      expect(espiaoEncode).not.toHaveBeenCalled();
    } finally {
      espiaoEncode.mockRestore();
    }
  });

  it("volta a gravar e a servir um hit normal depois do miss por tamanho", async () => {
    expect(api!.LIMITE_VALOR_CACHE_BYTES).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    const { kv, gravacoes } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: GIGANTE });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toBeNull();

    await cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].opcoes?.expirationTtl).toBe(TTL_PADRAO_SEGUNDOS);
    expect(await cache.ler(ENTRADA, BASE)).toEqual(SINAIS_VALIDOS);
  });

  it("um valor válido exatamente no teto de bytes ainda é hit (guarda é >)", async () => {
    expect(api!.LIMITE_VALOR_CACHE_BYTES).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    const base = JSON.stringify(SINAIS_VALIDOS);
    const preenchimento = LIMITE_VALOR_CACHE_BYTES_ESPERADO - bytesUtf8(base);
    expect(preenchimento).toBeGreaterThan(0);

    const noLimite = base + " ".repeat(preenchimento);
    expect(bytesUtf8(noLimite)).toBe(LIMITE_VALOR_CACHE_BYTES_ESPERADO);

    const { kv } = criarKvFake({ [chaveDe(ENTRADA, BASE)]: noLimite });
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    expect(await cache.ler(ENTRADA, BASE)).toEqual(SINAIS_VALIDOS);
  });
});

// Robustez do registrador injetado: a promessa "nunca lança" (§3.8) cobre
// também a falha do próprio registrador. Se `info` (ou seu destino) lança, o
// adaptador ainda degrada para miss na leitura e segue sem persistir na gravação.
describe("robustez-do-registrador", () => {
  const registradorQueLanca: RegistradorLocal = {
    info() {
      throw new Error("registrador indisponível");
    },
  };

  it("degrada para miss quando o próprio registrador lança na leitura", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, falharLeitura } = criarKvFake();
    falharLeitura(new Error("KV fora do ar na leitura"));
    const cache = api!.criarAdaptadorCacheSemantico!(kv, { registrador: registradorQueLanca });

    // A falha do registrador não pode substituir a degradação para miss.
    await expect(cache.ler(ENTRADA, BASE)).resolves.toBeNull();
  });

  it("segue sem persistir quando o próprio registrador lança na gravação", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    const { kv, armazem, falharGravacao } = criarKvFake();
    falharGravacao(new Error("KV fora do ar na gravação"));
    const cache = api!.criarAdaptadorCacheSemantico!(kv, { registrador: registradorQueLanca });

    const lancou = await semLancar(() => cache.gravar(ENTRADA, BASE, SINAIS_VALIDOS));

    expect(lancou).toBe(false);
    expect(armazem.size).toBe(0);
  });
});

// Snapshot único dos campos crus (§3.9): a guarda de teto, a derivação da chave e
// a revalidação precisam consumir UMA única leitura dos três campos brutos. Um
// objeto hostil com getters inconstantes devolve valor curto na 1ª leitura e
// gigante (> 64 KiB UTF-8) na 2ª: sem o snapshot, a guarda vê o valor curto e a
// derivação da chave serializa/gera hash do valor gigante (TOCTOU). O campo
// gigante nunca pode alcançar `JSON.stringify` nem indexar o KV.
const LIMITE_TEXTO_BRUTO_BYTES_ESPERADO = 64 * 1024;
const GIGANTE_CAMPO = "a".repeat(LIMITE_TEXTO_BRUTO_BYTES_ESPERADO + 1);

const CAMPOS_CRUS = ["observacao_recepcao", "convenio", "procedimento_codigo"] as const;
type CampoCruto = (typeof CAMPOS_CRUS)[number];
type ContagemDeLeituras = Record<CampoCruto, number>;

const LEITURA_UNICA: ContagemDeLeituras = {
  observacao_recepcao: 1,
  convenio: 1,
  procedimento_codigo: 1,
};

function contagemZerada(): ContagemDeLeituras {
  return { observacao_recepcao: 0, convenio: 0, procedimento_codigo: 0 };
}

function deltaDeLeituras(
  antes: ContagemDeLeituras,
  depois: ContagemDeLeituras,
): ContagemDeLeituras {
  return {
    observacao_recepcao: depois.observacao_recepcao - antes.observacao_recepcao,
    convenio: depois.convenio - antes.convenio,
    procedimento_codigo: depois.procedimento_codigo - antes.procedimento_codigo,
  };
}

// Entrada hostil: cada campo cru é um getter que conta as leituras e devolve o
// valor de `primeiro` na 1ª leitura e o de `seguinte` em todas as demais.
function criarEntradaHostil(
  primeiro: Record<CampoCruto, string>,
  seguinte: Record<CampoCruto, string>,
): { entrada: EntradaObservacao; leituras: ContagemDeLeituras } {
  const leituras = contagemZerada();
  const entrada = {} as EntradaObservacao;
  for (const campo of CAMPOS_CRUS) {
    Object.defineProperty(entrada, campo, {
      enumerable: true,
      configurable: true,
      get() {
        leituras[campo] += 1;
        return leituras[campo] === 1 ? primeiro[campo] : seguinte[campo];
      },
    });
  }
  return { entrada, leituras };
}

interface KvEspiao {
  kv: CacheKv;
  leituras: string[];
  gravacoes: Gravacao[];
  armazem: Map<string, string>;
}

// Estende o `criarKvFake` existente registrando também cada `get`, para provar
// qual chave indexou o KV.
function criarKvEspiao(inicial: Record<string, string> = {}): KvEspiao {
  const base = criarKvFake(inicial);
  const leituras: string[] = [];
  const kv: CacheKv = {
    async get(chave) {
      leituras.push(chave);
      return base.kv.get(chave);
    },
    async put(chave, valor, opcoes) {
      await base.kv.put(chave, valor, opcoes);
    },
    async delete(chave) {
      await base.kv.delete(chave);
    },
  };
  return { kv, leituras, gravacoes: base.gravacoes, armazem: base.armazem };
}

// Prova de não-serialização resistente a aninhamento: uma string gigante pode
// viajar dentro de um objeto ou array passado a `JSON.stringify`, então a
// varredura de cada argumento do espião é recursiva e não apenas superficial.
function contemTextoGigante(valor: unknown): boolean {
  if (typeof valor === "string") {
    return valor.includes(GIGANTE_CAMPO);
  }
  if (Array.isArray(valor)) {
    return valor.some((item) => contemTextoGigante(item));
  }
  if (valor !== null && typeof valor === "object") {
    return Object.values(valor as Record<string, unknown>).some((item) =>
      contemTextoGigante(item),
    );
  }
  return false;
}

describe("snapshot-unico-dos-campos-crus", () => {
  const CURTO: Record<CampoCruto, string> = {
    observacao_recepcao: TEXTO_OBSERVACAO,
    convenio: "unimed",
    procedimento_codigo: "40901114",
  };
  const GIGANTE: Record<CampoCruto, string> = {
    observacao_recepcao: GIGANTE_CAMPO,
    convenio: GIGANTE_CAMPO,
    procedimento_codigo: GIGANTE_CAMPO,
  };

  it("lê cada campo cru uma única vez e deriva a chave do snapshot curto em ler e gravar", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    expect(bytesUtf8(GIGANTE_CAMPO)).toBeGreaterThan(LIMITE_TEXTO_BRUTO_BYTES_ESPERADO);

    // Chaves calculadas FORA da janela do espião de `JSON.stringify`, para que a
    // computação do próprio teste não apareça como serialização do gigante.
    const chaveCurta = api!.montarChaveCacheSemantica!(CURTO, BASE).chave;
    const chaveGigante = api!.montarChaveCacheSemantica!(GIGANTE, BASE).chave;
    expect(chaveGigante).not.toBe(chaveCurta);

    // Controle positivo do scanner recursivo: ele DETECTA o gigante aninhado
    // dentro de objeto/array e não dispara em texto comum. Sem isso a asserção
    // de não-serialização poderia ser vacuamente verdadeira (falso negativo).
    expect(contemTextoGigante({ campos: [GIGANTE_CAMPO] })).toBe(true);
    expect(contemTextoGigante(["curto", { aninhado: "curto" }])).toBe(false);

    const { kv, leituras: chavesLidas, gravacoes, armazem } = criarKvEspiao();
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    const espiao = vi.spyOn(JSON, "stringify");
    let observado:
      | { deltaLer: ContagemDeLeituras; deltaGravar: ContagemDeLeituras; argumentos: unknown[] }
      | undefined;
    try {
      // Fixture hostil INDEPENDENTE por operação: cada uma devolve o valor curto
      // na própria 1ª leitura, de modo que `gravar` não herde a leitura já
      // consumida por `ler` (o que faria o snapshot ver o valor gigante).
      const hostilLer = criarEntradaHostil(CURTO, GIGANTE);
      const antesLer = { ...hostilLer.leituras };
      await cache.ler(hostilLer.entrada, BASE);
      const deltaLer = deltaDeLeituras(antesLer, hostilLer.leituras);

      const hostilGravar = criarEntradaHostil(CURTO, GIGANTE);
      const antesGravar = { ...hostilGravar.leituras };
      await cache.gravar(hostilGravar.entrada, BASE, SINAIS_VALIDOS);
      const deltaGravar = deltaDeLeituras(antesGravar, hostilGravar.leituras);

      observado = {
        deltaLer,
        deltaGravar,
        argumentos: espiao.mock.calls.map((chamada) => chamada[0]),
      };
    } finally {
      espiao.mockRestore();
    }

    expect(observado).toBeDefined();

    // Snapshot único: cada campo cru é lido exatamente uma vez por chamada, não
    // duas (guarda + chave). É a leitura dupla que abre a janela TOCTOU.
    expect(observado!.deltaLer).toEqual(LEITURA_UNICA);
    expect(observado!.deltaGravar).toEqual(LEITURA_UNICA);

    // O valor gigante nunca chega à serialização canônica — nem diretamente nem
    // aninhado dentro de um objeto/array argumento de JSON.stringify.
    expect(observado!.argumentos).not.toContain(GIGANTE_CAMPO);
    expect(observado!.argumentos.some((argumento) => contemTextoGigante(argumento))).toBe(
      false,
    );

    // Nenhuma interação de KV é indexada pela chave derivada do valor gigante.
    expect(chavesLidas).not.toContain(chaveGigante);
    expect(gravacoes.map((gravacao) => gravacao.chave)).not.toContain(chaveGigante);

    // A única chave tocada é a do snapshot curto, com TTL padrão de 24 h.
    expect(chavesLidas).toEqual([chaveCurta]);
    expect(gravacoes.map((gravacao) => gravacao.chave)).toEqual([chaveCurta]);
    expect(gravacoes[0].opcoes?.expirationTtl).toBe(TTL_PADRAO_SEGUNDOS);

    const persistido = armazem.get(chaveCurta);
    expect(typeof persistido).toBe("string");
    expect(JSON.parse(persistido as string)).toEqual(SINAIS_VALIDOS);
  });

  it("recusa o valor gigante no próprio snapshot sem tocar o KV nem serializá-lo", async () => {
    expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

    expect(bytesUtf8(GIGANTE_CAMPO)).toBeGreaterThan(LIMITE_TEXTO_BRUTO_BYTES_ESPERADO);

    // O snapshot já lê o valor gigante: a guarda de teto recusa a entrada antes de
    // qualquer derivação de chave, interação de KV ou serialização.
    const { entrada, leituras } = criarEntradaHostil(GIGANTE, GIGANTE);
    const { kv, leituras: chavesLidas, gravacoes } = criarKvEspiao();
    const cache = api!.criarAdaptadorCacheSemantico!(kv);

    const espiao = vi.spyOn(JSON, "stringify");
    let observado:
      | {
          resultado: SinaisObservacao | null;
          deltaLer: ContagemDeLeituras;
          deltaGravar: ContagemDeLeituras;
          argumentos: unknown[];
        }
      | undefined;
    try {
      const antesLer = { ...leituras };
      const resultado = await cache.ler(entrada, BASE);
      const deltaLer = deltaDeLeituras(antesLer, leituras);

      const antesGravar = { ...leituras };
      await cache.gravar(entrada, BASE, SINAIS_VALIDOS);
      const deltaGravar = deltaDeLeituras(antesGravar, leituras);

      observado = {
        resultado,
        deltaLer,
        deltaGravar,
        argumentos: espiao.mock.calls.map((chamada) => chamada[0]),
      };
    } finally {
      espiao.mockRestore();
    }

    expect(observado).toBeDefined();
    expect(observado!.resultado).toBeNull();

    // Cada campo é lido exatamente uma vez, mesmo que a guarda recuse o primeiro.
    expect(observado!.deltaLer).toEqual(LEITURA_UNICA);
    expect(observado!.deltaGravar).toEqual(LEITURA_UNICA);

    // Zero serialização do gigante e zero interação de KV.
    expect(observado!.argumentos).not.toContain(GIGANTE_CAMPO);
    expect(chavesLidas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });
});
