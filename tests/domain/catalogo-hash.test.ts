// Teste travado lt-catalogo-hash — SHA-256 puro, JSON recursivamente canônico e
// catálogo versionado.
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097). O módulo é tratado como `ApiAprovada`,
// interface local. RED por asserção de superfície/comportamento.
//
// Semântica exercitada de hashCatalogo: o texto canônico em UTF-8 é a entrada
// direta do SHA-256. Para um valor primitivo string, o texto canônico é a
// própria string — por isso os vetores conhecidos (vazio, "abc", fronteiras de
// bloco, multibloco e UTF-8 acentuado) o exercitam diretamente.
import { describe, expect, it } from "vitest";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

interface Catalogo {
  versao: string;
  hash: string;
  regrasVersao: string;
  convenios: unknown[];
  procedimentos: unknown[];
  limitacoesGlobais: string[];
}

type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; erros: string[] };

interface ProcedimentoConsulta {
  codigo: string;
  descricao: string;
  valorReferenciaCentavos: number;
}

interface ConsultaRegra {
  cobertura: string;
  procedimento: ProcedimentoConsulta | null;
  camposObrigatorios: string[];
  validadeMaximaDias: number;
  limiteSessoes: number;
  prazoEnvioDias: number;
  observacao: string;
  limitacoes: string[];
  regrasVersao: string;
}

interface ApiAprovada {
  hashCatalogo(json: unknown): string;
  carregarCatalogo(json: unknown): ResultadoCatalogo;
  consultarRegra(
    input: { convenio: string; procedimento_codigo: string },
    catalogo: Catalogo,
  ): ConsultaRegra;
}

// Catálogo sintético no mesmo formato do fixture imutável, mas com valores
// próprios. Cada arquivo de teste é autossuficiente.
const CATALOGO_JSON = {
  versao: "agosto/2026",
  definicoes: {
    autorizacao_valida:
      "A autorização vale até a data de validade, inclusive, comparada com a data do atendimento.",
    sessao_numero_na_autorizacao:
      "Posição desta sessão dentro da autorização. Não pode passar do limite do convênio.",
    prazo_envio_dias:
      "Dias, contados da data do atendimento, para a guia chegar ao convênio. Depois disso o convênio recusa.",
    valor: "Valor de referência do procedimento, em reais.",
  },
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
      procedimentos_cobertos: ["50000470", "50000560"],
      prazo_envio_dias: 30,
      observacao: "Reavaliação médica obrigatória a cada 10 sessões.",
    },
    {
      nome: "Saúde Interior",
      campos_obrigatorios: [
        "numero_autorizacao",
        "autorizacao_validade",
        "profissional_registro",
        "carteirinha",
      ],
      validade_maxima_autorizacao_dias: 45,
      limite_sessoes_por_autorizacao: 20,
      procedimentos_cobertos: ["50000470"],
      prazo_envio_dias: 45,
      observacao: "Aceita autorização verbal com protocolo por até 5 dias úteis.",
    },
  ],
};

const GLOBAL_NAO_VERIFICAVEL = "duracao_maxima_autorizacao_nao_verificavel";

// Reordena recursivamente as chaves de objetos para provar que a
// canonicalização não depende da ordem de inserção.
function reordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(reordenar);
  }
  if (valor !== null && typeof valor === "object") {
    const origem = valor as Record<string, unknown>;
    const destino: Record<string, unknown> = {};
    for (const chave of Object.keys(origem).reverse()) {
      destino[chave] = reordenar(origem[chave]);
    }
    return destino;
  }
  return valor;
}

const CINQUENTA_E_CINCO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012"; // 55 bytes
const QUARENTA_E_OITO_BITS =
  "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"; // 56 bytes — fronteira 448 bits
const SESSENTA_E_TRES =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"; // 63 bytes
const CINQUENTA_E_DOIS_BITS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"; // 64 bytes — fronteira 512 bits

const VETORES_SHA256: Array<[string, string]> = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [CINQUENTA_E_CINCO, "d74ba075e4259c6c807c4101e66d281096cf9ff14ba01260dee741b1bdaef326"],
  [QUARENTA_E_OITO_BITS, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
  [SESSENTA_E_TRES, "46372051e032316ff56a181a3b27c36d22fa0f725bf12470878de68f7f2a98cd"],
  [CINQUENTA_E_DOIS_BITS, "dfc806def494bcc996f23e096484f171432a19944968eff9a76c09dab64d0a44"],
  ["a".repeat(1000), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3"],
  [
    "Ação e coração: R$ 62,00 — nº 1",
    "85740ac47bc9e5ce4dc27f350ef8ccfdb5ff6db79d2c1df1fd7e6f644f2eac43",
  ],
];

describe("hashCatalogo — SHA-256 e JSON canônico", () => {
  it("confere os vetores SHA-256 conhecidos", () => {
    expect(typeof api.hashCatalogo).toBe("function");

    for (const [texto, esperado] of VETORES_SHA256) {
      expect(api.hashCatalogo(texto)).toBe(esperado);
    }
    expect(api.hashCatalogo("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canonicaliza chaves recursivamente, sem depender da ordem", () => {
    expect(typeof api.hashCatalogo).toBe("function");

    expect(api.hashCatalogo(CATALOGO_JSON)).toBe(api.hashCatalogo(reordenar(CATALOGO_JSON)));
    expect(api.hashCatalogo({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(
      api.hashCatalogo({ a: [{ c: 3, d: 2 }], b: 1 }),
    );
    expect(api.hashCatalogo(CATALOGO_JSON)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("carregarCatalogo e consultarRegra", () => {
  it("valida o catálogo e consulta a regra com valores concretos", () => {
    expect(typeof api.carregarCatalogo).toBe("function");

    const resultado = api.carregarCatalogo(CATALOGO_JSON);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) {
      throw new Error(`catálogo sintético deveria ser válido: ${resultado.erros.join("; ")}`);
    }
    const catalogo = resultado.catalogo;

    expect(catalogo.versao).toBe("agosto/2026");
    expect(catalogo.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(catalogo.regrasVersao).toBe(`${catalogo.versao}#${catalogo.hash}`);
    expect(catalogo.limitacoesGlobais).toContain(GLOBAL_NAO_VERIFICAVEL);

    expect(typeof api.consultarRegra).toBe("function");
    const regra = api.consultarRegra(
      { convenio: "  vitalcard ", procedimento_codigo: "50000470" },
      catalogo,
    );

    expect(regra.cobertura).toBe("coberto");
    expect(regra.procedimento).toEqual({
      codigo: "50000470",
      descricao: "Sessão de fisioterapia musculoesquelética",
      valorReferenciaCentavos: 6200,
    });
    expect([...regra.camposObrigatorios].sort()).toEqual([
      "autorizacao_validade",
      "carteirinha",
      "cid",
      "numero_autorizacao",
      "profissional_registro",
    ]);
    expect(regra.validadeMaximaDias).toBe(30);
    expect(regra.limiteSessoes).toBe(10);
    expect(regra.prazoEnvioDias).toBe(30);
    expect(regra.observacao).toBe("Reavaliação médica obrigatória a cada 10 sessões.");
    expect(Array.isArray(regra.limitacoes)).toBe(true);
    expect(regra.limitacoes.every((item) => typeof item === "string")).toBe(true);
    expect(regra.regrasVersao).toBe(catalogo.regrasVersao);

    const foraDeCobertura = api.consultarRegra(
      { convenio: "Vitalcard", procedimento_codigo: "20103301" },
      catalogo,
    );
    expect(foraDeCobertura.cobertura).toBe("nao_coberto");
  });

  it("rejeita estrutura inválida sem catálogo parcial", () => {
    expect(typeof api.carregarCatalogo).toBe("function");

    const entradasInvalidas: unknown[] = [null, [], "x", {}, { versao: "x" }];
    for (const entrada of entradasInvalidas) {
      const resultado = api.carregarCatalogo(entrada);
      expect(resultado.ok).toBe(false);
      if (resultado.ok) {
        throw new Error("estrutura inválida foi aceita como catálogo");
      }
      expect(Array.isArray(resultado.erros)).toBe(true);
      expect(resultado.erros.length).toBeGreaterThan(0);
      expect("catalogo" in resultado).toBe(false);
    }
  });
});
