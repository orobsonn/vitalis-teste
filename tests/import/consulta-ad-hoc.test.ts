// Teste travado lt-consulta-ad-hoc-sem-gravacao (#ac-15):
//
//   Given um D1 populado (duas guias que formam par duplicado) e uma guia com
//   conferência semântica fornecida,
//   When uma conferência ad hoc é solicitada,
//   Then a decisão concreta e os findings são devolvidos — refletindo a
//   conferência fornecida e, quando a assinatura da guia entra num grupo já
//   existente, o overlay de duplicidade — mas as contagens de linhas de
//   guides/guide_revisions/validations/findings/semantic_extractions/
//   estado_global, a revisão e a validação correntes por guia e o número
//   observado de statements SQL de escrita permanecem EXATAMENTE inalterados.
//
// O barrel `src/application/guides/index.ts` entra por `import.meta.glob` (a SUT
// ainda não existe): a primeira asserção é de superfície, de modo que o RED é
// falha de asserção, nunca erro de coleta/import. As ENTRADAS usam só módulos já
// integrados (`src/domain`, `tests/storage/support/banco`). Sem `node:fs`, sem
// rede, sem dependência nova, sem relógio de parede.
import { describe, expect, it } from "vitest";

import { criarBanco } from "../storage/support/banco";
import { carregarCatalogo, hashCatalogo, normalizarGuia } from "../../src/domain";
import type {
  Catalogo,
  GuiaNormalizada,
  GuiaOriginal,
  LinhaGuiaCsv,
  Motivo,
  ResultadoVerificacao,
} from "../../src/domain";

// ---------------------------------------------------------------------------
// Superfície congelada do barrel da SUT (interface local; nunca import estático)
// ---------------------------------------------------------------------------

interface ExtracaoSemanticaPersistivel {
  observacaoHash: string;
  modelo: string;
  promptVersao: string;
  sinais: unknown[];
  situacao: unknown;
  ambiguidades: unknown[];
}

interface ConferenciaPersistivel {
  resultado: ResultadoVerificacao;
  extracao: ExtracaoSemanticaPersistivel | null;
}

interface OpcoesAdHoc {
  guia: GuiaNormalizada;
  conferencia: ConferenciaPersistivel;
  regras: Catalogo;
  agora: string;
}

interface ResultadoAdHoc {
  decisao: "OK" | "PENDENTE";
  motivos: Motivo[];
}

interface ApiAprovada {
  registrarGuia(
    db: D1Database,
    opcoes: {
      guia: GuiaNormalizada;
      conferencia: ConferenciaPersistivel;
      idempotencyKey?: string;
      importId?: string;
      regras: Catalogo;
      agora: string;
    },
  ): Promise<{ tipo: string }>;
  conferirGuiaAdHoc(db: D1Database, opcoes: OpcoesAdHoc): Promise<ResultadoAdHoc>;
}

const modulos = import.meta.glob("../../src/application/guides/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.registrarGuia).toBe("function");
  expect(typeof api?.conferirGuiaAdHoc).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Fixtures determinísticas: células oficiais inline (nada de node:fs)
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";

const CATALOGO_JSON = {
  versao: "teste-guias-2026",
  definicoes: {},
  limitacoes_globais: [],
  procedimentos: [
    { codigo: "20103301", descricao: "Consulta ortopédica", valor_referencia: 90 },
  ],
  convenios: [
    {
      nome: "Vitalcard",
      campos_obrigatorios: ["numero_autorizacao", "profissional_registro", "carteirinha"],
      validade_maxima_autorizacao_dias: 30,
      limite_sessoes_por_autorizacao: 10,
      procedimentos_cobertos: ["20103301"],
      prazo_envio_dias: 30,
      observacao: "Catálogo mínimo de teste.",
    },
  ],
};

function carregarRegras(): Catalogo {
  const resultado = carregarCatalogo(CATALOGO_JSON);
  if (!resultado.ok) {
    throw new Error(`catálogo de teste inválido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function normalizar(idGuia: string, dataAtendimento: string): GuiaNormalizada {
  const original: GuiaOriginal = {
    id_guia: idGuia,
    unidade: "Sul",
    data_atendimento: dataAtendimento,
    paciente: "P-1051",
    convenio: "Vitalcard",
    carteirinha: "258573823",
    cid: "S83.5",
    procedimento_codigo: "20103301",
    procedimento_descricao: "Consulta ortopédica",
    numero_autorizacao: "AUT124496",
    autorizacao_validade: "2026-09-19",
    autorizacao_sessoes_limite: "10",
    sessao_numero_na_autorizacao: "7",
    profissional: "Dr. Otávio Prado",
    profissional_registro: "CRM-SP 97731",
    valor: "90.00",
    observacao_recepcao: "",
    data_lancamento: "2026-08-28",
  };
  const linha: LinhaGuiaCsv = { numero: 1, original, linhaOriginal: "" };
  return normalizarGuia(linha);
}

const GUIA_0027 = (): GuiaNormalizada => normalizar("G-2608-0027", "26/08/2026");
const GUIA_0057 = (): GuiaNormalizada => normalizar("G-2608-0057", "2026-08-26");

function conferenciaPersistida(regras: Catalogo): ConferenciaPersistivel {
  return {
    resultado: {
      decisao: "OK",
      motivos: [],
      orientacoes: [],
      limitacoes: [],
      checagem_textual: "nao_aplicavel",
      referencia_temporal: null,
      regras_versao: regras.regrasVersao,
      inferencia_textual: null,
    },
    extracao: null,
  };
}

function conferenciaAdHoc(regras: Catalogo): ConferenciaPersistivel {
  return {
    resultado: {
      decisao: "PENDENTE",
      motivos: [
        {
          codigo: "valor_ilegivel",
          severidade: "pendencia",
          campos: ["valor"],
          regra: "O valor deve ser um número em reais.",
          evidencia: 'Valor original "ilegivel" no campo valor.',
          orientacao: "Corrija o valor da guia.",
        },
      ],
      orientacoes: ["Corrija o valor da guia."],
      limitacoes: [],
      checagem_textual: "nao_aplicavel",
      referencia_temporal: null,
      regras_versao: regras.regrasVersao,
      inferencia_textual: null,
    },
    extracao: {
      observacaoHash: "obs-ad-hoc",
      modelo: "modelo-teste",
      promptVersao: "prompt-v1",
      sinais: [],
      situacao: { autorizacao: "nenhuma" },
      ambiguidades: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Semeadura de D1 e leituras diretas
// ---------------------------------------------------------------------------

async function semearImport(db: D1Database, id: string, chave: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO imports (id, idempotency_key, arquivo_nome, arquivo_hash, regras_versao, regras_hash, status, tamanho_chunk, linhas_encontradas, iniciado_em, atualizado_em, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, chave, "guias.csv", "hash-arquivo", "regras-v1", "hash-regras", "PROCESSANDO", 25, 1, AGORA, AGORA, null)
    .run();
}

async function semearRuleset(db: D1Database, id: string, hash: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO rulesets (id, versao, hash, conteudo_json, criado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, "teste-guias-2026", hash, JSON.stringify(CATALOGO_JSON), AGORA)
    .run();
}

async function contar(db: D1Database, tabela: string): Promise<number> {
  const linha = await db
    .prepare(`SELECT COUNT(*) AS total FROM ${tabela}`)
    .first<{ total: number }>();
  return Number(linha?.total ?? 0);
}

interface CorrentesGuia {
  revisaoId: string;
  validacaoId: string;
}

async function correntesDaGuia(db: D1Database, idGuia: string): Promise<CorrentesGuia> {
  const revisao = await db
    .prepare(
      `SELECT r.id AS revisao_id, v.id AS validacao_id
         FROM guide_revisions r
         JOIN guides g ON g.id = r.guide_id
         LEFT JOIN validations v ON v.revision_id = r.id AND v.vigente = 1
        WHERE g.id_guia = ? AND r.vigente = 1`,
    )
    .bind(idGuia)
    .first<{ revisao_id: string; validacao_id: string | null }>();
  if (!revisao || revisao.validacao_id === null) {
    throw new Error(`guia sem revisão/validação corrente: ${idGuia}`);
  }
  return { revisaoId: revisao.revisao_id, validacaoId: revisao.validacao_id };
}

// ---------------------------------------------------------------------------
// Wrapper de D1: conta run() de INSERT/UPDATE/DELETE executados
// ---------------------------------------------------------------------------

interface RegistroStatement {
  sql: string;
}

const registros = new WeakMap<object, RegistroStatement>();

function ehEscrita(sql: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql);
}

function envolverStatement(
  statement: D1PreparedStatement,
  registro: RegistroStatement,
  aoExecutar: (sql: string) => void,
): D1PreparedStatement {
  const alvo = statement as unknown as object;
  const envolto = new Proxy(alvo, {
    get(target, prop, receiver) {
      if (prop === "bind") {
        return (...values: unknown[]) =>
          envolverStatement((target as D1PreparedStatement).bind(...values), registro, aoExecutar);
      }
      if (prop === "run") {
        return async () => {
          aoExecutar(registro.sql);
          return (target as D1PreparedStatement).run();
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function"
        ? (valor as (...args: unknown[]) => unknown).bind(target)
        : valor;
    },
  });
  registros.set(envolto as object, registro);
  return envolto as unknown as D1PreparedStatement;
}

function envolverDbContandoEscritas(db: D1Database, contador: { escritas: number }): D1Database {
  const alvo = db as unknown as object;
  return new Proxy(alvo, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (sql: string) =>
          envolverStatement((target as D1Database).prepare(sql), { sql }, (executado) => {
            if (ehEscrita(executado)) {
              contador.escritas += 1;
            }
          });
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function"
        ? (valor as (...args: unknown[]) => unknown).bind(target)
        : valor;
    },
  }) as unknown as D1Database;
}

const TABELAS = [
  "guides",
  "guide_revisions",
  "validations",
  "findings",
  "semantic_extractions",
  "estado_global",
];

// ---------------------------------------------------------------------------
// Caso
// ---------------------------------------------------------------------------

describe("consulta ad hoc", () => {
  it("devolve decisão e findings sem escrever nada nem alterar o estado durável (#ac-15)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    // Duas guias com a MESMA assinatura de nove campos formam um par duplicado.
    await api.registrarGuia(db, {
      guia: GUIA_0027(),
      conferencia: conferenciaPersistida(regras),
      idempotencyKey: "K-0027",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
    await api.registrarGuia(db, {
      guia: GUIA_0057(),
      conferencia: conferenciaPersistida(regras),
      idempotencyKey: "K-0057",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });

    const antes: Record<string, number> = {};
    for (const tabela of TABELAS) {
      antes[tabela] = await contar(db, tabela);
    }
    const correntesAntes = {
      "G-2608-0027": await correntesDaGuia(db, "G-2608-0027"),
      "G-2608-0057": await correntesDaGuia(db, "G-2608-0057"),
    };

    const contador = { escritas: 0 };
    const dbObservado = envolverDbContandoEscritas(db, contador);

    const resultado = await api.conferirGuiaAdHoc(dbObservado, {
      guia: GUIA_0027(),
      conferencia: conferenciaAdHoc(regras),
      regras,
      agora: AGORA,
    });

    // A decisão concreta e os findings refletem a conferência fornecida.
    expect(resultado.decisao).toBe("PENDENTE");
    const codigos = resultado.motivos.map((motivo) => motivo.codigo);
    expect(codigos).toContain("valor_ilegivel");
    // A assinatura da guia entra no grupo já existente ⇒ overlay de duplicidade.
    expect(codigos).toContain("duplicidade_grupo_candidato");

    // Nenhuma escrita SQL foi executada.
    expect(contador.escritas).toBe(0);

    // Contagens e correntes duráveis exatamente inalteradas.
    for (const tabela of TABELAS) {
      expect(await contar(db, tabela)).toBe(antes[tabela]);
    }
    expect(await correntesDaGuia(db, "G-2608-0027")).toEqual(correntesAntes["G-2608-0027"]);
    expect(await correntesDaGuia(db, "G-2608-0057")).toEqual(correntesAntes["G-2608-0057"]);
  });
});
