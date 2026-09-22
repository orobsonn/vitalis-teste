// Teste travado lt-catalogo-hash — SHA-256 puro, JSON recursivamente canônico e
// catálogo versionado.
//
// O barrel é importado por import.meta.glob (a forma com extensão `.ts` é
// rejeitada pelo tsc com TS5097). O módulo é tratado como `ApiAprovada`,
// interface local. RED por asserção de superfície/comportamento.
//
// Semântica exercitada de hashCatalogo: o digest é o SHA-256 do JSON
// canônico — chaves ordenadas recursivamente, sem espaços insignificantes e
// strings citadas/escapadas como no JSON padrão, inclusive para um primitivo
// string de topo. O primitivo SHA-256 cru (vazio, "abc", fronteiras de bloco,
// multibloco e UTF-8 acentuado) é exercitado diretamente pelo módulo
// ../../src/shared/sha256.ts.
import { describe, expect, it } from "vitest";

const modulosBarrel = import.meta.glob("../../src/domain/index.ts", { eager: true });
const api = Object.values(modulosBarrel)[0] as unknown as ApiAprovada;

interface ApiSha {
  sha256Hex(texto: string): string;
}

const modulosSha = import.meta.glob("../../src/shared/sha256.ts", { eager: true });
const sha = Object.values(modulosSha)[0] as unknown as ApiSha;

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

// Cópia profunda do catálogo sintético válido para introduzir um único defeito
// por variação, sem mutar o original.
function clonarCatalogo(): typeof CATALOGO_JSON {
  return JSON.parse(JSON.stringify(CATALOGO_JSON)) as typeof CATALOGO_JSON;
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
  it("confere os vetores SHA-256 crus conhecidos", () => {
    expect(typeof sha.sha256Hex).toBe("function");

    for (const [texto, esperado] of VETORES_SHA256) {
      expect(sha.sha256Hex(texto)).toBe(esperado);
    }
    expect(sha.sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hasheia o JSON canônico, citando strings em qualquer posição", () => {
    expect(typeof api.hashCatalogo).toBe("function");

    // Um primitivo string de topo é a string JSON citada/escapada, não os
    // bytes crus: o vetor clássico de "abc" não é o digest de hashCatalogo.
    expect(api.hashCatalogo("abc")).toBe(sha.sha256Hex(JSON.stringify("abc")));
    expect(api.hashCatalogo("abc")).toBe(sha.sha256Hex('"abc"'));
    expect(api.hashCatalogo("abc")).not.toBe(sha.sha256Hex("abc"));
    expect(api.hashCatalogo("")).toBe(sha.sha256Hex('""'));

    // Objetos: chaves ordenadas, sem espaços e strings citadas.
    expect(api.hashCatalogo({ b: [1, "x"], a: "abc" })).toBe(
      sha.sha256Hex('{"a":"abc","b":[1,"x"]}'),
    );
    expect(api.hashCatalogo({ b: [1, "x"], a: "abc" })).toMatch(/^[0-9a-f]{64}$/);

    // Sem colisões entre null/"null" nem entre ["a","b"]/["a,b"].
    expect(api.hashCatalogo({ x: null })).not.toBe(api.hashCatalogo({ x: "null" }));
    expect(api.hashCatalogo({ x: ["a", "b"] })).not.toBe(api.hashCatalogo({ x: ["a,b"] }));
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

  it("rejeita catálogos ambíguos ou inconsistentes sem catálogo parcial", () => {
    expect(typeof api.carregarCatalogo).toBe("function");

    // O catálogo sintético intacto continua válido.
    expect(api.carregarCatalogo(CATALOGO_JSON).ok).toBe(true);

    const codigoDuplicado = clonarCatalogo();
    codigoDuplicado.procedimentos.push({
      ...codigoDuplicado.procedimentos[0]!,
      descricao: "Procedimento duplicado",
    });

    const nomeDuplicado = clonarCatalogo();
    nomeDuplicado.convenios[1]!.nome = "  vitalcard ";

    const campoDesconhecido = clonarCatalogo();
    campoDesconhecido.convenios[0]!.campos_obrigatorios.push("campo_inexistente");

    const coberturaOrfa = clonarCatalogo();
    coberturaOrfa.convenios[0]!.procedimentos_cobertos.push("99999999");

    const prazoFracionario = clonarCatalogo();
    prazoFracionario.convenios[0]!.prazo_envio_dias = 30.5;

    const limiteFracionario = clonarCatalogo();
    limiteFracionario.convenios[0]!.limite_sessoes_por_autorizacao = 10.5;

    const validadeFracionaria = clonarCatalogo();
    validadeFracionaria.convenios[0]!.validade_maxima_autorizacao_dias = 30.5;

    const valorInseguro = clonarCatalogo();
    valorInseguro.procedimentos[0]!.valor_referencia = Number.MAX_SAFE_INTEGER;

    const invalidos: Array<[string, unknown]> = [
      ["código de procedimento duplicado", codigoDuplicado],
      ["nome de convênio normalizado duplicado", nomeDuplicado],
      ["campo obrigatório fora das 18 colunas", campoDesconhecido],
      ["procedimento coberto ausente", coberturaOrfa],
      ["prazo de envio fracionário", prazoFracionario],
      ["limite de sessões fracionário", limiteFracionario],
      ["validade máxima fracionária", validadeFracionaria],
      ["valor de referência inseguro", valorInseguro],
    ];

    for (const [rotulo, entrada] of invalidos) {
      const resultado = api.carregarCatalogo(entrada);
      expect(resultado.ok, rotulo).toBe(false);
      if (resultado.ok) {
        throw new Error(`catálogo inválido foi aceito: ${rotulo}`);
      }
      expect(Array.isArray(resultado.erros)).toBe(true);
      expect(resultado.erros.length).toBeGreaterThan(0);
      expect("catalogo" in resultado).toBe(false);
    }
  });
});
