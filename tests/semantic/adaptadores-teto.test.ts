// Teste travado da task-4-cache-semantico (feature
// semantic-observation-interpretation):
//   lt-adaptadores-teto-de-abuso — o teto de abuso por campo cru (§3.9) vale
//                                   para os DOIS adaptadores públicos. O
//                                   adaptador de produção de inferência
//                                   (`criarInterpretadorWorkersAi`) e o
//                                   adaptador de cache semântico
//                                   (`criarAdaptadorCacheSemantico`) recusam
//                                   qualquer um dos três campos crus acima de
//                                   64 KiB em bytes UTF-8: `extrair` lança
//                                   `ErroTetoDeAbuso` sem chamar `ai.run` nem
//                                   serializar o payload, e `ler`/`gravar`
//                                   devolvem miss/sem gravação sem chamar
//                                   `kv.get`/`kv.put` nem montar a chave.
//                                   Exatamente no teto (inclusive multibyte e
//                                   astral) o comportamento anterior é
//                                   preservado: a requisição exata de três
//                                   campos com `max_tokens` 512 e a chave
//                                   versionada `semantico:v1:` sob TTL 86400
//                                   (#ac-13, #ac-22, #ac-23, §3.1, §3.8, §3.9).
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097) e tratado como `ApiAprovada`, interface local.
// Os bindings `AI` e KV reais são substituídos por fakes estruturais que
// registram cada chamada (`ai.run`, `kv.get`, `kv.put` inclusive
// `options.expirationTtl`). Nenhuma dependência nova, nenhuma rede.
import { describe, expect, it, vi } from "vitest";

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

interface OpcoesInterpretador {
  modelo?: string;
}

interface BindingAi {
  run(modelo: string, entrada: Record<string, unknown>): Promise<unknown>;
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

interface Sinal {
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
  ambiguidades: { tipo: string; evidencia: string }[];
}

interface OpcoesPut {
  expirationTtl?: number;
}

interface CacheKv {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: OpcoesPut): Promise<void>;
  delete(chave: string): Promise<void>;
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
  LIMITE_TEXTO_BRUTO_BYTES: number;
  campoTemTamanhoDeAbuso(valor: string): boolean;
  TEXTO_PROMPT: string;
  MODELO_OBSERVACAO: string;
  PROMPT_HASH: string;
  ErroTetoDeAbuso: new (...args: unknown[]) => Error;
  criarInterpretadorWorkersAi(
    ai: BindingAi,
    opcoes?: OpcoesInterpretador,
  ): InterpretadorObservacao;
  NAMESPACE_CACHE_SEMANTICO: string;
  TTL_PADRAO_CACHE_SEGUNDOS: number;
  montarChaveCacheSemantica(
    entrada: EntradaObservacao,
    contexto: ContextoCache,
  ): ChaveCacheSemantica;
  criarAdaptadorCacheSemantico(
    kv: CacheKv,
    opcoes?: { ttlSegundos?: number },
  ): AdaptadorCacheSemantico;
}

const modulosBarrel = import.meta.glob("../../src/semantic/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada | undefined;

const TETO = 64 * 1024;
const TTL_PADRAO_SEGUNDOS = 86400;
const NAMESPACE = "semantico:v1:";
const CODIFICADOR = new TextEncoder();

function bytesUtf8(texto: string): number {
  return CODIFICADOR.encode(texto).length;
}

// Contexto de inferência usado na derivação da chave de cache. Os valores são
// fixos e determinísticos; o que importa aqui é que o teto de abuso não dependa
// deles.
const CONTEXTO: ContextoCache = {
  modelo: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  promptVersao: "observacao-v1",
  promptHash: api?.PROMPT_HASH ?? "0".repeat(64),
};

// Evidência literal cercada por fronteiras de palavra, para que a revalidação de
// schema/evidência aceite os sinais na leitura de cache exatamente no teto.
const EVIDENCIA = "autorizacao nova";
const PREFIXO_EVIDENCIA = "Relato: autorizacao nova nao cadastrada informada. ";

/**
 * Constrói um campo cujo UTF-8 mede EXATAMENTE o teto (65536 bytes), com a
 * evidência literal no começo e preenchimento da unidade multibyte informada.
 * O preenchimento usa unidades inteiras e completa a diferença (menor que a
 * unidade) com espaços ASCII, de modo que a borda em bytes é exata.
 */
function campoExatoNoTeto(unidade: string): string {
  const prefixoBytes = bytesUtf8(PREFIXO_EVIDENCIA);
  const unidadeBytes = bytesUtf8(unidade);
  const corpo = unidade.repeat(Math.floor((TETO - prefixoBytes) / unidadeBytes));
  const falta = TETO - prefixoBytes - bytesUtf8(corpo);
  return PREFIXO_EVIDENCIA + corpo + " ".repeat(falta);
}

function entradaComCampo(campo: keyof EntradaObservacao, valor: string): EntradaObservacao {
  const entrada: EntradaObservacao = {
    observacao_recepcao: "Observacao de rotina com autorizacao nova informada.",
    convenio: "unimed",
    procedimento_codigo: "40901114",
  };
  entrada[campo] = valor;
  return entrada;
}

// Sinais válidos: evidência literal copiada da observação `campoExatoNoTeto` e
// situação neutra coerente com `nota_administrativa`.
const SINAIS_VALIDOS: SinaisObservacao = {
  sinais: [{ tipo: "nota_administrativa", evidencia: EVIDENCIA }],
  situacao: {
    autorizacao: "nenhuma",
    modalidade: "nenhuma",
    procedimento: "nenhuma",
    reagendamento: "nenhum",
  },
  ambiguidades: [],
};

interface ChamadaAi {
  modelo: string;
  entrada: Record<string, unknown>;
}

function criarBindingFake(respostaProvedor: { response: string }): {
  binding: BindingAi;
  chamadas: ChamadaAi[];
} {
  const chamadas: ChamadaAi[] = [];
  const binding: BindingAi = {
    async run(modelo, entrada) {
      chamadas.push({ modelo, entrada });
      return respostaProvedor;
    },
  };
  return { binding, chamadas };
}

interface Gravacao {
  chave: string;
  valor: string;
  opcoes?: OpcoesPut;
}

interface KvFake {
  kv: CacheKv;
  gets: string[];
  gravacoes: Gravacao[];
  armazem: Map<string, string>;
}

// KV fake estrutural: registra cada `get` e cada `put` (inclusive o TTL).
function criarKvFake(inicial: Record<string, string> = {}): KvFake {
  const armazem = new Map<string, string>(Object.entries(inicial));
  const gets: string[] = [];
  const gravacoes: Gravacao[] = [];
  const kv: CacheKv = {
    async get(chave) {
      gets.push(chave);
      return armazem.get(chave) ?? null;
    },
    async put(chave, valor, opcoes) {
      gravacoes.push({ chave, valor, opcoes });
      armazem.set(chave, valor);
    },
    async delete(chave) {
      armazem.delete(chave);
    },
  };
  return { kv, gets, gravacoes, armazem };
}

// Captura o erro lançado por uma ação assíncrona sem acoplar o teste ao tipo.
async function capturarErro(acao: () => Promise<unknown>): Promise<unknown> {
  try {
    await acao();
  } catch (capturado) {
    return capturado;
  }
  return undefined;
}

// Executa a ação sob um espião de `JSON.stringify` (a serialização usada por
// `textoCanonico`/`montarRequisicao`), capturando quantas vezes ela serializou,
// além do resultado ou erro, sempre restaurando o espião no `finally`.
async function medirSerializacoes<T>(
  acao: () => Promise<T>,
): Promise<{ total: number; resultado?: T; erro?: unknown }> {
  const espiao = vi.spyOn(JSON, "stringify");
  const saida: { total: number; resultado?: T; erro?: unknown } = { total: -1 };
  try {
    saida.resultado = await acao();
  } catch (capturado) {
    saida.erro = capturado;
  } finally {
    saida.total = espiao.mock.calls.length;
    espiao.mockRestore();
  }
  return saida;
}

const CAMPOS_BRUTOS: (keyof EntradaObservacao)[] = [
  "observacao_recepcao",
  "convenio",
  "procedimento_codigo",
];

describe("lt-adaptadores-teto-de-abuso", () => {
  it("acopla o teto ao contrato compartilhado exportado pelo barrel", () => {
    expect(api?.LIMITE_TEXTO_BRUTO_BYTES).toBe(TETO);
    expect(typeof api?.campoTemTamanhoDeAbuso).toBe("function");
    expect(api?.NAMESPACE_CACHE_SEMANTICO).toBe(NAMESPACE);
    expect(api?.TTL_PADRAO_CACHE_SEGUNDOS).toBe(TTL_PADRAO_SEGUNDOS);
  });

  // ---------------------------------------------------------------------------
  // 1. Acima do teto: caminho rápido (`.length`) e medição exata em bytes.
  // ---------------------------------------------------------------------------
  const ACIMA_ASCII = "a".repeat(TETO + 1); // `.length` > teto ⇒ caminho rápido.
  const ACIMA_MULTIBYTE = "é".repeat(40000); // 80000 bytes, `.length` 40000.
  const ACIMA_ASTRAL = "😀".repeat(20000); // 80000 bytes, `.length` 40000.

  const CASOS_ACIMA: { rotulo: string; valor: string }[] = [
    { rotulo: "ASCII (caminho rápido de .length)", valor: ACIMA_ASCII },
    { rotulo: "multibyte (medição exata em bytes)", valor: ACIMA_MULTIBYTE },
    { rotulo: "astral (medição exata em bytes)", valor: ACIMA_ASTRAL },
  ];

  it("reconhece cada valor acima do teto como abuso (fonte compartilhada)", () => {
    expect(api?.LIMITE_TEXTO_BRUTO_BYTES).toBe(TETO);
    for (const { valor } of CASOS_ACIMA) {
      expect(api?.campoTemTamanhoDeAbuso(valor)).toBe(true);
    }
    // O caminho rápido realmente é exercitado: o ASCII já excede em `.length`.
    expect(ACIMA_ASCII.length).toBeGreaterThan(TETO);
    // Os multibyte estão SOB o teto em `.length` e só excedem em bytes.
    expect(ACIMA_MULTIBYTE.length).toBeLessThan(TETO);
    expect(ACIMA_ASTRAL.length).toBeLessThan(TETO);
  });

  for (const campo of CAMPOS_BRUTOS) {
    for (const { rotulo, valor } of CASOS_ACIMA) {
      it(`recusa ${campo} acima do teto (${rotulo}) nos dois adaptadores`, async () => {
        const ConstrutorErro = api?.ErroTetoDeAbuso;
        expect(typeof ConstrutorErro).toBe("function");
        expect(api?.LIMITE_TEXTO_BRUTO_BYTES).toBe(TETO);
        expect(api?.campoTemTamanhoDeAbuso(valor)).toBe(true);

        const entrada = entradaComCampo(campo, valor);

        // --- Workers AI: recusa tipada, sem inferência e sem serializar ---
        const { binding, chamadas } = criarBindingFake({ response: "{}" });
        const interpretador = api!.criarInterpretadorWorkersAi!(binding);

        const medicaoAi = await medirSerializacoes(() => interpretador.extrair(entrada));

        expect(chamadas).toHaveLength(0);
        expect(medicaoAi.total).toBe(0);
        const erro = medicaoAi.erro;
        expect(erro).toBeInstanceOf(ConstrutorErro);
        expect((erro as Error).name).toBe("ErroTetoDeAbuso");
        // A mensagem nomeia o campo, nunca o valor bruto.
        expect((erro as Error).message).not.toContain(valor);

        // --- Cache: ler = miss sem tocar o KV nem montar a chave ---
        const { kv, gets, gravacoes } = criarKvFake();
        const cache = api!.criarAdaptadorCacheSemantico!(kv);

        const medicaoLer = await medirSerializacoes(() => cache.ler(entrada, CONTEXTO));
        expect(medicaoLer.erro).toBeUndefined();
        expect(medicaoLer.resultado).toBeNull();
        expect(gets).toHaveLength(0);
        expect(medicaoLer.total).toBe(0);

        // --- Cache: gravar = sem gravação, sem tocar o KV nem montar a chave ---
        const medicaoGravar = await medirSerializacoes(() =>
          cache.gravar(entrada, CONTEXTO, SINAIS_VALIDOS),
        );
        expect(medicaoGravar.erro).toBeUndefined();
        expect(gravacoes).toHaveLength(0);
        expect(medicaoGravar.total).toBe(0);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Exatamente no teto: borda inclusiva em bytes, inclusive multibyte e astral.
  // ---------------------------------------------------------------------------
  const CASOS_EXATOS: { rotulo: string; unidade: string; campoPuro: string }[] = [
    { rotulo: "BMP multibyte (é)", unidade: "é", campoPuro: "é".repeat(32768) },
    { rotulo: "astral (😀)", unidade: "😀", campoPuro: "😀".repeat(16384) },
  ];

  for (const { rotulo, unidade, campoPuro } of CASOS_EXATOS) {
    it(`considera ${rotulo} exatamente no teto como NÃO abuso (borda inclusiva)`, () => {
      expect(api?.LIMITE_TEXTO_BRUTO_BYTES).toBe(TETO);
      expect(bytesUtf8(campoPuro)).toBe(TETO);
      // `.length` está bem abaixo do teto: a decisão exige a medição em bytes.
      expect(campoPuro.length).toBeLessThan(TETO);
      expect(api?.campoTemTamanhoDeAbuso(campoPuro)).toBe(false);
    });

    it(`Workers AI envia ${rotulo} exatamente no teto com a requisição de três campos`, async () => {
      expect(typeof api?.criarInterpretadorWorkersAi).toBe("function");
      expect(bytesUtf8(campoPuro)).toBe(TETO);
      expect(api?.campoTemTamanhoDeAbuso(campoPuro)).toBe(false);

      const entrada: EntradaObservacao = {
        observacao_recepcao: campoPuro,
        convenio: "unimed",
        procedimento_codigo: "40901114",
      };
      const { binding, chamadas } = criarBindingFake({ response: "{}" });
      const interpretador = api!.criarInterpretadorWorkersAi!(binding);

      await interpretador.extrair(entrada);

      // Uma única chamada, com a requisição exata de §3.1.
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].entrada).toEqual({
        messages: [
          { role: "system", content: api?.TEXTO_PROMPT },
          { role: "user", content: JSON.stringify(entrada) },
        ],
        max_tokens: 512,
      });
      expect(Object.keys(chamadas[0].entrada).sort()).toEqual(["max_tokens", "messages"]);

      const mensagens = chamadas[0].entrada.messages as { role: string; content: string }[];
      const payload = JSON.parse(mensagens[1].content) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        "convenio",
        "observacao_recepcao",
        "procedimento_codigo",
      ]);
      expect(payload.observacao_recepcao).toBe(campoPuro);
    });

    it(`Workers AI recusa ${rotulo} um caractere acima do teto, sem chamar o provedor`, async () => {
      const ConstrutorErro = api?.ErroTetoDeAbuso;
      expect(typeof ConstrutorErro).toBe("function");

      const acima = campoPuro + unidade;
      expect(bytesUtf8(acima)).toBeGreaterThan(TETO);
      expect(api?.campoTemTamanhoDeAbuso(acima)).toBe(true);

      const entrada = entradaComCampo("observacao_recepcao", acima);
      const { binding, chamadas } = criarBindingFake({ response: "{}" });
      const interpretador = api!.criarInterpretadorWorkersAi!(binding);

      const erro = await capturarErro(() => interpretador.extrair(entrada));

      expect(chamadas).toHaveLength(0);
      expect(erro).toBeInstanceOf(ConstrutorErro);
      expect((erro as Error).name).toBe("ErroTetoDeAbuso");
    });

    it(`cache grava e serve hit com observação ${rotulo} exatamente no teto`, async () => {
      expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");
      expect(typeof api?.montarChaveCacheSemantica).toBe("function");

      const observacao = campoExatoNoTeto(unidade);
      expect(bytesUtf8(observacao)).toBe(TETO);
      expect(api?.campoTemTamanhoDeAbuso(observacao)).toBe(false);

      const entrada: EntradaObservacao = {
        observacao_recepcao: observacao,
        convenio: "unimed",
        procedimento_codigo: "40901114",
      };
      const { kv, gravacoes } = criarKvFake();
      const cache = api!.criarAdaptadorCacheSemantico!(kv);

      await cache.gravar(entrada, CONTEXTO, SINAIS_VALIDOS);

      // Uma gravação, na chave versionada derivada, com TTL padrão de 24 h.
      const chaveEsperada = api!.montarChaveCacheSemantica!(entrada, CONTEXTO).chave;
      expect(gravacoes).toHaveLength(1);
      expect(gravacoes[0].chave).toBe(chaveEsperada);
      expect(chaveEsperada.startsWith(NAMESPACE)).toBe(true);
      expect(gravacoes[0].opcoes?.expirationTtl).toBe(TTL_PADRAO_SEGUNDOS);

      // A leitura revalida schema/evidência e devolve o hit persistido.
      expect(await cache.ler(entrada, CONTEXTO)).toEqual(SINAIS_VALIDOS);
    });

    it(`cache recusa ${rotulo} um caractere acima do teto sem tocar o KV`, async () => {
      expect(typeof api?.criarAdaptadorCacheSemantico).toBe("function");

      const acima = campoExatoNoTeto(unidade) + unidade;
      expect(bytesUtf8(acima)).toBeGreaterThan(TETO);
      expect(api?.campoTemTamanhoDeAbuso(acima)).toBe(true);

      const entrada = entradaComCampo("observacao_recepcao", acima);
      const { kv, gets, gravacoes } = criarKvFake();
      const cache = api!.criarAdaptadorCacheSemantico!(kv);

      const medicaoLer = await medirSerializacoes(() => cache.ler(entrada, CONTEXTO));
      expect(medicaoLer.resultado).toBeNull();
      expect(medicaoLer.total).toBe(0);
      expect(gets).toHaveLength(0);

      const medicaoGravar = await medirSerializacoes(() =>
        cache.gravar(entrada, CONTEXTO, SINAIS_VALIDOS),
      );
      expect(medicaoGravar.erro).toBeUndefined();
      expect(medicaoGravar.total).toBe(0);
      expect(gravacoes).toHaveLength(0);
    });
  }
});
