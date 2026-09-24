// Teste travado lt-revisao-historico-concorrencia (#ac-3, #ac-4, #ac-6):
//
//   Given uma guia A e um ruleset em D1,
//   When A é salva, corrigida para B e a antiga A é enviada de novo,
//   Then restam exatamente duas revisões com só B vigente, A volta
//   `reaproveitada`, a validação/findings/extração correntes refletem a
//   conferência FORNECIDA (não o `id_guia`) e a reutilização da
//   `idempotencyKey` "K-B" com conteúdo divergente devolve
//   `conflito_idempotencia` sem escrever. Uma colisão UNIQUE única durante a
//   inserção condicional da guia refaz o preparo uma vez, sem revisão
//   duplicada. Com uma linha de importação reivindicada em EM_ANDAMENTO, os
//   statements preparados com `guarda={linhaId,token}` gravam guia + revisão
//   quando o dono casa e gravam ZERO linhas de guia/revisão/validação/findings/
//   extração quando o token diverge ou a posse não existe; sem `guarda`,
//   `persistirConferenciaDaGuia` grava normalmente.
//
// O barrel `src/application/guides/index.ts` entra por `import.meta.glob` (a
// SUT ainda não existe): a primeira asserção é de superfície, de modo que o RED
// é falha de asserção, nunca erro de coleta/import. As ENTRADAS usam só módulos
// já integrados (`src/domain`, `tests/storage/support/banco`). Sem `node:fs`,
// sem rede, sem dependência nova, sem relógio de parede.
import { describe, expect, it } from "vitest";

import { criarBanco } from "../storage/support/banco";
import { carregarCatalogo, hashCatalogo, normalizarGuia } from "../../src/domain";
import type {
  Catalogo,
  GuiaNormalizada,
  GuiaOriginal,
  LinhaGuiaCsv,
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

interface OpcoesPersistencia {
  guia: GuiaNormalizada;
  conferencia: ConferenciaPersistivel;
  idempotencyKey?: string;
  importId?: string;
  regras: Catalogo;
  agora: string;
  guarda?: { linhaId: string; token: string };
}

interface ResultadoPersistencia {
  tipo: "criada" | "reaproveitada" | "conflito_idempotencia";
  revisao?: unknown;
  validacao?: unknown;
}

interface ResultadoPreparo extends ResultadoPersistencia {
  statements: D1PreparedStatement[];
}

interface ApiAprovada {
  registrarGuia(db: D1Database, opcoes: OpcoesPersistencia): Promise<ResultadoPersistencia>;
  persistirConferenciaDaGuia(
    db: D1Database,
    opcoes: OpcoesPersistencia,
  ): Promise<ResultadoPersistencia>;
  prepararPersistenciaConferencia(
    db: D1Database,
    opcoes: OpcoesPersistencia,
  ): Promise<ResultadoPreparo>;
}

const modulos = import.meta.glob("../../src/application/guides/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.registrarGuia).toBe("function");
  expect(typeof api?.persistirConferenciaDaGuia).toBe("function");
  expect(typeof api?.prepararPersistenciaConferencia).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Fixtures determinísticas: células oficiais inline (nada de node:fs)
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";
const DEPOIS = "2026-03-05T10:05:00.000Z";
const MAIS_TARDE = "2026-03-05T10:30:00.000Z";

const CATALOGO_JSON = {
  versao: "teste-guias-2026",
  definicoes: {},
  limitacoes_globais: [],
  procedimentos: [
    { codigo: "20103301", descricao: "Consulta ortopédica", valor_referencia: 90 },
    { codigo: "50000560", descricao: "Sessão de fisioterapia neurofuncional", valor_referencia: 70 },
  ],
  convenios: [
    {
      nome: "Vitalcard",
      campos_obrigatorios: ["numero_autorizacao", "profissional_registro", "carteirinha"],
      validade_maxima_autorizacao_dias: 30,
      limite_sessoes_por_autorizacao: 10,
      procedimentos_cobertos: ["20103301", "50000560"],
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

function celulasBase(): GuiaOriginal {
  return {
    id_guia: "G-2608-0027",
    unidade: "Sul",
    data_atendimento: "26/08/2026",
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
}

function normalizar(celulas: Partial<GuiaOriginal>): GuiaNormalizada {
  const original: GuiaOriginal = { ...celulasBase(), ...celulas };
  const linha: LinhaGuiaCsv = { numero: 1, original, linhaOriginal: "" };
  return normalizarGuia(linha);
}

const GUIA_A = (): GuiaNormalizada => normalizar({});
const GUIA_B = (): GuiaNormalizada =>
  normalizar({
    paciente: "P-9999",
    observacao_recepcao: "Correção humana aplicada sobre a guia original.",
    valor: "95.00",
  });

function conferenciaA(regras: Catalogo): ConferenciaPersistivel {
  return {
    resultado: {
      decisao: "PENDENTE",
      motivos: [
        {
          codigo: "convenio_nao_catalogado",
          severidade: "pendencia",
          campos: ["convenio"],
          regra: "Regra fornecida A.",
          evidencia: "Evidência fornecida A.",
          orientacao: "Orientação fornecida A.",
        },
      ],
      orientacoes: ["Orientação fornecida A."],
      limitacoes: ["limitacao_fornecida_a"],
      checagem_textual: "nao_aplicavel",
      referencia_temporal: null,
      regras_versao: regras.regrasVersao,
      inferencia_textual: null,
    },
    extracao: {
      observacaoHash: "obs-fornecida-a",
      modelo: "modelo-teste",
      promptVersao: "prompt-v1",
      sinais: [{ tipo: "reagendamento" }],
      situacao: { reagendamento: "mencionado" },
      ambiguidades: [],
    },
  };
}

function conferenciaB(regras: Catalogo): ConferenciaPersistivel {
  return {
    resultado: {
      decisao: "OK",
      motivos: [
        {
          codigo: "valor_divergente_da_referencia",
          severidade: "alerta",
          campos: ["valor"],
          regra: "Regra fornecida B.",
          evidencia: "Evidência fornecida B.",
          orientacao: "Orientação fornecida B.",
        },
      ],
      orientacoes: [],
      limitacoes: [],
      checagem_textual: "nao_aplicavel",
      referencia_temporal: "2026-08-29",
      regras_versao: regras.regrasVersao,
      inferencia_textual: null,
    },
    extracao: {
      observacaoHash: "obs-fornecida-b",
      modelo: "modelo-teste",
      promptVersao: "prompt-v1",
      sinais: [],
      situacao: { autorizacao: "nenhuma" },
      ambiguidades: [],
    },
  };
}

// Conferência neutra (decisão OK, sem motivos) com uma extração cujo id
// determinístico é justamente o alvo das regressões de digest ambíguo.
function conferenciaCom(
  regras: Catalogo,
  extracao: Pick<ExtracaoSemanticaPersistivel, "observacaoHash" | "modelo" | "promptVersao">,
): ConferenciaPersistivel {
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
    extracao: {
      observacaoHash: extracao.observacaoHash,
      modelo: extracao.modelo,
      promptVersao: extracao.promptVersao,
      sinais: [],
      situacao: {},
      ambiguidades: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Semeadura de D1 e leituras diretas (a SUT só é exercitada pelas portas)
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

async function semearLinha(
  db: D1Database,
  linha: { id: string; importId: string; numero: number; estado: string; dono: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO import_lines (id, import_id, numero_linha, estado, linha_original, original_json, motivo, dono, reservado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      linha.id,
      linha.importId,
      linha.numero,
      linha.estado,
      "linha crua",
      null,
      null,
      linha.dono,
      null,
      AGORA,
    )
    .run();
}

interface RevisaoLinha {
  id: string;
  guide_id: string;
  numero: number;
  vigente: number;
  conteudo_hash: string;
  idempotency_key: string | null;
  entrada_original_json: string;
  entrada_normalizada_json: string;
}

interface ValidacaoLinha {
  id: string;
  revision_id: string;
  sequencia: number;
  vigente: number;
  decisao: string;
  referencia_temporal: string | null;
  regras_versao: string;
  regras_hash: string;
  ruleset_id: string;
  extracao_id: string | null;
  orientacoes_json: string;
  limitacoes_json: string;
}

interface FindingLinha {
  ordem: number;
  codigo: string;
  severidade: string;
  campos_json: string;
  regra: string;
  evidencia: string;
  orientacao: string;
}

interface ExtracaoLinha {
  id: string;
  observacao_hash: string;
  modelo: string;
  prompt_versao: string;
  sinais_json: string;
}

async function contar(db: D1Database, tabela: string): Promise<number> {
  const linha = await db
    .prepare(`SELECT COUNT(*) AS total FROM ${tabela}`)
    .first<{ total: number }>();
  return Number(linha?.total ?? 0);
}

async function idInternoDaGuia(db: D1Database, idGuia: string): Promise<string | null> {
  const linha = await db
    .prepare("SELECT id FROM guides WHERE id_guia = ?")
    .bind(idGuia)
    .first<{ id: string }>();
  return linha?.id ?? null;
}

async function revisoesDaGuia(db: D1Database, guideId: string): Promise<RevisaoLinha[]> {
  const { results } = await db
    .prepare(
      `SELECT id, guide_id, numero, vigente, conteudo_hash, idempotency_key, entrada_original_json, entrada_normalizada_json
         FROM guide_revisions WHERE guide_id = ? ORDER BY numero ASC`,
    )
    .bind(guideId)
    .all<RevisaoLinha>();
  return results;
}

async function validacaoVigente(db: D1Database, revisionId: string): Promise<ValidacaoLinha | null> {
  return db
    .prepare(
      `SELECT id, revision_id, sequencia, vigente, decisao, referencia_temporal, regras_versao, regras_hash, ruleset_id, extracao_id, orientacoes_json, limitacoes_json
         FROM validations WHERE revision_id = ? AND vigente = 1`,
    )
    .bind(revisionId)
    .first<ValidacaoLinha>();
}

async function findingsDaValidacao(db: D1Database, validationId: string): Promise<FindingLinha[]> {
  const { results } = await db
    .prepare(
      `SELECT ordem, codigo, severidade, campos_json, regra, evidencia, orientacao
         FROM findings WHERE validation_id = ? ORDER BY ordem ASC`,
    )
    .bind(validationId)
    .all<FindingLinha>();
  return results;
}

async function extracaoPorId(db: D1Database, extracaoId: string): Promise<ExtracaoLinha | null> {
  return db
    .prepare(
      `SELECT id, observacao_hash, modelo, prompt_versao, sinais_json FROM semantic_extractions WHERE id = ?`,
    )
    .bind(extracaoId)
    .first<ExtracaoLinha>();
}

// ---------------------------------------------------------------------------
// Wrapper de D1: conta run() de INSERT/UPDATE/DELETE e permite injetar uma vez
// uma linha conflitante de `guides` antes do primeiro lote com escrita. O Proxy
// passa `instanceof StatementD1Sqlite` e delega run/bind/first/all ao alvo.
// ---------------------------------------------------------------------------

interface RegistroStatement {
  sql: string;
  valores: unknown[];
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
        return (...values: unknown[]) => {
          const ligado = (target as D1PreparedStatement).bind(...values);
          return envolverStatement(ligado, { sql: registro.sql, valores: values }, aoExecutar);
        };
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

interface ControleColisao {
  escritas: number;
  injectadosGuia: number;
  // Quantos lotes delegados continham um `INSERT INTO guides`: no máximo o
  // original + o único retry (limite superior do preparo).
  lotesComInsertGuia: number;
  // Quantos lotes delegados rejeitaram com falha de unicidade: exatamente um.
  lotesRejeitadosUnico: number;
}

function envolverDbComColisao(
  db: D1Database,
  controle: ControleColisao,
  idGuiaConflitante: string,
): D1Database {
  const alvo = db as unknown as object;
  return new Proxy(alvo, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (sql: string) =>
          envolverStatement(
            (target as D1Database).prepare(sql),
            { sql, valores: [] },
            (executado) => {
              if (ehEscrita(executado)) {
                controle.escritas += 1;
              }
            },
          );
      }
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const temInsertGuia = statements.some((statement) => {
            const registro = registros.get(statement as object);
            return registro !== undefined && /INSERT\s+INTO\s+guides\b/i.test(registro.sql);
          });
          if (temInsertGuia) {
            controle.lotesComInsertGuia += 1;
          }
          if (controle.injectadosGuia === 0) {
            for (const statement of statements) {
              const registro = registros.get(statement as object);
              if (registro !== undefined && /INSERT\s+INTO\s+guides\b/i.test(registro.sql)) {
                controle.injectadosGuia += 1;
                // id_guia conhecido da fixture; id diferente do determinístico
                // da SUT, de modo que o predicado `NOT EXISTS (id = :guiaId)`
                // siga verdadeiro e o INSERT condicional colida de fato em
                // `UNIQUE(id_guia)`, sem depender de hash nem de ordem de bind.
                await (target as D1Database)
                  .prepare(
                    "INSERT INTO guides (id, id_guia, import_id_inicial, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)",
                  )
                  .bind(`conflito-${idGuiaConflitante}`, idGuiaConflitante, "imp-1", AGORA, AGORA)
                  .run();
                break;
              }
            }
          }
          // Conta a rejeição por unicidade antes de repropagar, de modo que o
          // teste observe exatamente quantas vezes o lote delegado falhou.
          try {
            return await (target as D1Database).batch(statements);
          } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : String(erro);
            if (/UNIQUE constraint failed/.test(mensagem)) {
              controle.lotesRejeitadosUnico += 1;
            }
            throw erro;
          }
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function"
        ? (valor as (...args: unknown[]) => unknown).bind(target)
        : valor;
    },
  }) as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Wrapper de contagem: quantos statements de MUTAÇÃO a SUT prepara via
// `db.prepare` durante a chamada. Reads `SELECT` (lerGuia/idempotência) NÃO
// contam; o contrato é "antes de preparar qualquer statement [de escrita]".
// ---------------------------------------------------------------------------

interface ContadorPreparos {
  preparosDeMutacao: number;
}

function envolverDbContandoMutacoes(db: D1Database, contador: ContadorPreparos): D1Database {
  const alvo = db as unknown as object;
  return new Proxy(alvo, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (sql: string) => {
          if (ehEscrita(sql)) {
            contador.preparosDeMutacao += 1;
          }
          return (target as D1Database).prepare(sql);
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function"
        ? (valor as (...args: unknown[]) => unknown).bind(target)
        : valor;
    },
  }) as unknown as D1Database;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("registrar guia: histórico A→B→A, idempotência e retry de colisão", () => {
  it("A→B→A preserva histórico, reaproveita A e reflete a conferência fornecida (#ac-3, #ac-4)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    const hash = hashCatalogo(CATALOGO_JSON);
    expect(hash).toBe(regras.hash);
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hash);

    // 1. Salva A.
    const salvoA = await api.registrarGuia(db, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-A",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
    expect(salvoA.tipo).toBe("criada");
    expect(await contar(db, "guides")).toBe(1);
    const guideId = await idInternoDaGuia(db, "G-2608-0027");
    expect(guideId).not.toBeNull();
    let revisoes = await revisoesDaGuia(db, guideId!);
    expect(revisoes).toHaveLength(1);
    expect(revisoes[0].numero).toBe(1);
    expect(revisoes[0].vigente).toBe(1);

    // A validação corrente referencia um ruleset existente com o hash do catálogo.
    const validacaoA = await validacaoVigente(db, revisoes[0].id);
    expect(validacaoA).not.toBeNull();
    expect(validacaoA!.regras_hash).toBe(hash);
    expect(validacaoA!.ruleset_id).not.toBe("");
    const rulesetGravado = await db
      .prepare("SELECT id, hash FROM rulesets WHERE id = ?")
      .bind(validacaoA!.ruleset_id)
      .first<{ id: string; hash: string }>();
    expect(rulesetGravado?.hash).toBe(hash);

    // A validação/findings/extração correntes vêm da conferência FORNECIDA.
    expect(validacaoA!.decisao).toBe("PENDENTE");
    const findingsA = await findingsDaValidacao(db, validacaoA!.id);
    expect(findingsA.map((f) => f.codigo)).toEqual(["convenio_nao_catalogado"]);
    expect(findingsA[0].evidencia).toBe("Evidência fornecida A.");
    const extracaoA = await extracaoPorId(db, validacaoA!.extracao_id!);
    expect(extracaoA?.observacao_hash).toBe("obs-fornecida-a");

    // 2. Corrige para B.
    const salvoB = await api.registrarGuia(db, {
      guia: GUIA_B(),
      conferencia: conferenciaB(regras),
      idempotencyKey: "K-B",
      importId: "imp-1",
      regras,
      agora: DEPOIS,
    });
    expect(salvoB.tipo).toBe("criada");
    expect(await contar(db, "guide_revisions")).toBe(2);
    const revisaoB = (await revisoesDaGuia(db, guideId!)).find((r) => r.numero === 2);
    expect(revisaoB?.vigente).toBe(1);
    revisoes = await revisoesDaGuia(db, guideId!);
    expect(revisoes.map((r) => r.vigente)).toEqual([0, 1]);

    const validacaoB = await validacaoVigente(db, revisaoB!.id);
    expect(validacaoB).not.toBeNull();
    expect(validacaoB!.decisao).toBe("OK");
    expect(validacaoB!.referencia_temporal).toBe("2026-08-29");
    const findingsB = await findingsDaValidacao(db, validacaoB!.id);
    expect(findingsB.map((f) => f.codigo)).toEqual(["valor_divergente_da_referencia"]);
    expect(findingsB[0].evidencia).toBe("Evidência fornecida B.");
    const extracaoB = await extracaoPorId(db, validacaoB!.extracao_id!);
    expect(extracaoB?.observacao_hash).toBe("obs-fornecida-b");

    // 3. Reenvia A sem idempotencyKey ⇒ reaproveitada, sem ressurreição.
    const reenvioA = await api.registrarGuia(db, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      importId: "imp-1",
      regras,
      agora: MAIS_TARDE,
    });
    expect(reenvioA.tipo).toBe("reaproveitada");
    expect(await contar(db, "guide_revisions")).toBe(2);
    expect((await revisoesDaGuia(db, guideId!)).map((r) => r.vigente)).toEqual([0, 1]);
    const validacaoPosReenvio = await validacaoVigente(db, revisaoB!.id);
    expect(validacaoPosReenvio?.id).toBe(validacaoB!.id);
    expect(validacaoPosReenvio?.decisao).toBe("OK");

    // 4. Reutiliza "K-B" com o conteúdo de A ⇒ conflito explícito e ZERO escrita.
    const conflito = await api.registrarGuia(db, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-B",
      importId: "imp-1",
      regras,
      agora: MAIS_TARDE,
    });
    expect(conflito.tipo).toBe("conflito_idempotencia");
    expect(await contar(db, "guide_revisions")).toBe(2);
    expect((await revisoesDaGuia(db, guideId!)).map((r) => r.vigente)).toEqual([0, 1]);
    expect((await validacaoVigente(db, revisaoB!.id))?.decisao).toBe("OK");
  });

  it("colisão UNIQUE única na inserção condicional da guia refaz o preparo sem revisão duplicada (#ac-6, J22)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    // O wrapper injeta, antes do primeiro lote com INSERT INTO guides, uma linha
    // conflitante com o MESMO id_guia e um id DIFERENTE do determinístico. O
    // predicado `NOT EXISTS (id = :guiaId)` do statement condicional segue
    // verdadeiro, então o INSERT realmente tenta e colide em `UNIQUE(id_guia)`;
    // o preparo é refeito uma vez e relê a guia já existente.
    const controle: ControleColisao = {
      escritas: 0,
      injectadosGuia: 0,
      lotesComInsertGuia: 0,
      lotesRejeitadosUnico: 0,
    };
    const dbEnvolvido = envolverDbComColisao(db, controle, "G-2608-0027");

    const resultado = await api.registrarGuia(dbEnvolvido, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-1",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });

    expect(controle.injectadosGuia).toBe(1);
    // Retry limitado a exatamente uma repetição: no máximo o lote original mais
    // um retry tentam o INSERT condicional da guia, e só um lote falha em UNIQUE.
    expect(controle.lotesComInsertGuia).toBeGreaterThanOrEqual(1);
    expect(controle.lotesComInsertGuia).toBeLessThanOrEqual(2);
    expect(controle.lotesRejeitadosUnico).toBe(1);
    expect(resultado.tipo).toBe("criada");
    expect(await contar(db, "guides")).toBe(1);
    expect(await contar(db, "guide_revisions")).toBe(1);
    const guideId = await idInternoDaGuia(db, "G-2608-0027");
    expect(guideId).not.toBeNull();
    expect(await revisoesDaGuia(db, guideId!)).toHaveLength(1);
  });

  it("guarda de posse: token dono grava e token divergente ou posse ausente não grava nada (#ac-6, J18)", async () => {
    const api = exigirApi();
    const regras = carregarRegras();
    const hash = hashCatalogo(CATALOGO_JSON);

    // Caso positivo: token dono casa com a linha EM_ANDAMENTO.
    const dbDono = await criarBanco();
    await semearImport(dbDono, "imp-1", "chave-imp");
    await semearRuleset(dbDono, "rs-1", hash);
    await semearLinha(dbDono, {
      id: "linha-1",
      importId: "imp-1",
      numero: 1,
      estado: "EM_ANDAMENTO",
      dono: "token-dono",
    });
    const prepDono = await api.prepararPersistenciaConferencia(dbDono, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-DONO",
      importId: "imp-1",
      regras,
      agora: AGORA,
      guarda: { linhaId: "linha-1", token: "token-dono" },
    });
    expect(Array.isArray(prepDono.statements)).toBe(true);
    await dbDono.batch(prepDono.statements);
    expect(await contar(dbDono, "guides")).toBe(1);
    expect(await contar(dbDono, "guide_revisions")).toBe(1);
    expect(await contar(dbDono, "validations")).toBe(1);
    expect(await contar(dbDono, "findings")).toBe(1);
    expect(await contar(dbDono, "semantic_extractions")).toBe(1);

    // Caso negativo 1: token divergente ⇒ lote inteiro é no-op.
    const dbToken = await criarBanco();
    await semearImport(dbToken, "imp-1", "chave-imp");
    await semearRuleset(dbToken, "rs-1", hash);
    await semearLinha(dbToken, {
      id: "linha-1",
      importId: "imp-1",
      numero: 1,
      estado: "EM_ANDAMENTO",
      dono: "token-dono",
    });
    const prepToken = await api.prepararPersistenciaConferencia(dbToken, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-TOKEN",
      importId: "imp-1",
      regras,
      agora: AGORA,
      guarda: { linhaId: "linha-1", token: "token-divergente" },
    });
    await dbToken.batch(prepToken.statements);
    expect(await contar(dbToken, "guides")).toBe(0);
    expect(await contar(dbToken, "guide_revisions")).toBe(0);
    expect(await contar(dbToken, "validations")).toBe(0);
    expect(await contar(dbToken, "findings")).toBe(0);
    expect(await contar(dbToken, "semantic_extractions")).toBe(0);

    // Caso negativo 2: posse ausente (dono nulo) ⇒ lote inteiro é no-op.
    const dbSemDono = await criarBanco();
    await semearImport(dbSemDono, "imp-1", "chave-imp");
    await semearRuleset(dbSemDono, "rs-1", hash);
    await semearLinha(dbSemDono, {
      id: "linha-1",
      importId: "imp-1",
      numero: 1,
      estado: "EM_ANDAMENTO",
      dono: null,
    });
    const prepSemDono = await api.prepararPersistenciaConferencia(dbSemDono, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-SEM-DONO",
      importId: "imp-1",
      regras,
      agora: AGORA,
      guarda: { linhaId: "linha-1", token: "token-dono" },
    });
    await dbSemDono.batch(prepSemDono.statements);
    expect(await contar(dbSemDono, "guides")).toBe(0);
    expect(await contar(dbSemDono, "guide_revisions")).toBe(0);
    expect(await contar(dbSemDono, "validations")).toBe(0);
    expect(await contar(dbSemDono, "findings")).toBe(0);
    expect(await contar(dbSemDono, "semantic_extractions")).toBe(0);
  });

  it("sem guarda, persistirConferenciaDaGuia grava a guia normalmente (#ac-3)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    const resultado = await api.persistirConferenciaDaGuia(db, {
      guia: GUIA_A(),
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-SEM-GUARDA",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });

    expect(resultado.tipo).toBe("criada");
    expect(await contar(db, "guides")).toBe(1);
    expect(await contar(db, "guide_revisions")).toBe(1);
    expect(await contar(db, "validations")).toBe(1);
    // A conferência fornecida persiste por inteiro: um motivo e uma extração.
    expect(await contar(db, "findings")).toBe(1);
    expect(await contar(db, "semantic_extractions")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Regressões da revisão final global: fronteiras de escrita que passavam sem
// validar centavos, com hash de conteúdo ambíguo sob NUL e com `importId`
// ausente (NOT NULL em `guides.import_id_inicial`).
// ---------------------------------------------------------------------------

describe("regressões da revisão final: centavos, hash injetivo e importId", () => {
  it("rejeita guia nova com centavos não normalizados antes de qualquer escrita", async () => {
    const api = exigirApi();
    const regras = carregarRegras();
    const hash = hashCatalogo(CATALOGO_JSON);

    // NaN/Infinity virariam `null` silenciosamente no JSON e inteiros acima de
    // MAX_SAFE_INTEGER (ou fracionários) entrariam inexatos; o preparo deve
    // falhar com erro tipado ANTES de preparar/executar qualquer statement.
    for (const valorCentavos of [Number.NaN, Number.MAX_SAFE_INTEGER + 2, 1.5]) {
      const db = await criarBanco();
      await semearImport(db, "imp-1", "chave-imp");
      await semearRuleset(db, "rs-1", hash);
      const guia: GuiaNormalizada = { ...GUIA_A(), valorCentavos };

      // Rejeitar + zero linhas não basta: o preparo deve falhar ANTES de
      // preparar qualquer statement de MUTAÇÃO. Reads `SELECT` de decisão não
      // contam; só SQL com prefixo INSERT/UPDATE/DELETE incrementa o contador.
      const contador: ContadorPreparos = { preparosDeMutacao: 0 };
      const dbEnvolvido = envolverDbContandoMutacoes(db, contador);
      let erro: unknown = null;
      try {
        await api.prepararPersistenciaConferencia(dbEnvolvido, {
          guia,
          conferencia: conferenciaA(regras),
          importId: "imp-1",
          regras,
          agora: AGORA,
        });
      } catch (capturado) {
        erro = capturado;
      }

      expect(erro).toBeInstanceOf(TypeError);
      expect(contador.preparosDeMutacao).toBe(0);
      expect(await contar(db, "guides")).toBe(0);
      expect(await contar(db, "guide_revisions")).toBe(0);
    }
  });

  it("hash de conteúdo é injetivo: NUL dentro de célula não colide com a célula adjacente", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    // X e Y têm conteúdo CRU diferente, mas o join interno das células cruas
    // com "\u0000" produz exatamente a mesma string `S\u0000A\u0000B`.
    const X = normalizar({ unidade: "S\u0000A", data_atendimento: "B" });
    const Y = normalizar({ unidade: "S", data_atendimento: "A\u0000B" });
    expect(X.original.unidade).toBe("S\u0000A");
    expect(Y.original.unidade).toBe("S");
    expect(X.original.unidade).not.toBe(Y.original.unidade);
    // Datas inválidas ⇒ assinatura de duplicidade nula; nenhum grupo acidental.
    expect(X.dataAtendimento).toBeNull();
    expect(Y.dataAtendimento).toBeNull();

    const r1 = await api.registrarGuia(db, {
      guia: X,
      conferencia: conferenciaA(regras),
      idempotencyKey: "K-NUL-X",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
    expect(r1.tipo).toBe("criada");

    // Y é conteúdo distinto de X: precisa virar nova revisão, nunca
    // `reaproveitada` por colisão do digest.
    const r2 = await api.registrarGuia(db, {
      guia: Y,
      conferencia: conferenciaA(regras),
      importId: "imp-1",
      regras,
      agora: DEPOIS,
    });
    expect(r2.tipo).toBe("criada");

    expect(await contar(db, "guides")).toBe(1);
    expect(await contar(db, "guide_revisions")).toBe(2);
  });

  it("guia nova sem importId falha com erro tipado antes de gravar", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    // `guides.import_id_inicial` é NOT NULL: sem `importId` o preparo deve
    // falhar antes de montar/executar o batch, sem lote sintético. Além do
    // erro tipado e de zero linhas, NENHUM statement de MUTAÇÃO pode ter sido
    // preparado via `db.prepare` (reads `SELECT` de decisão não contam).
    const contador: ContadorPreparos = { preparosDeMutacao: 0 };
    const dbEnvolvido = envolverDbContandoMutacoes(db, contador);
    let erro: unknown = null;
    try {
      await api.prepararPersistenciaConferencia(dbEnvolvido, {
        guia: GUIA_A(),
        conferencia: conferenciaA(regras),
        regras,
        agora: AGORA,
      });
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeInstanceOf(TypeError);
    expect(contador.preparosDeMutacao).toBe(0);
    expect(await contar(db, "guides")).toBe(0);
    expect(await contar(db, "guide_revisions")).toBe(0);
  });

  it("id de extração é injetivo: modelo/prompt com NUL não colidem entre triplas distintas (#ac-4)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    // Duas triplas semânticas DISTINTAS cujo id determinístico concatena os
    // mesmos pedaços: "H\u0000m\u0000x\u0000p" nos dois casos. A UNIQUE
    // (observacao_hash, modelo, prompt_versao) as distingue, então o id do
    // conteúdo precisa ser injetivo sobre os três campos.
    const conferenciaX = conferenciaCom(regras, {
      observacaoHash: "H",
      modelo: "m\u0000x",
      promptVersao: "p",
    });
    const conferenciaY = conferenciaCom(regras, {
      observacaoHash: "H",
      modelo: "m",
      promptVersao: "x\u0000p",
    });

    const resultadoX = await api.registrarGuia(db, {
      guia: normalizar({ id_guia: "G-2608-7101" }),
      conferencia: conferenciaX,
      idempotencyKey: "K-EXT-X",
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
    expect(resultadoX.tipo).toBe("criada");

    // Captura a falha para que o RED seja de asserção: a segunda gravação
    // precisa ser "criada", nunca rejeitada por colisão de PK da extração.
    let erroY: unknown = null;
    let resultadoY: ResultadoPersistencia | null = null;
    try {
      resultadoY = await api.registrarGuia(db, {
        guia: normalizar({ id_guia: "G-2608-7102" }),
        conferencia: conferenciaY,
        idempotencyKey: "K-EXT-Y",
        importId: "imp-1",
        regras,
        agora: DEPOIS,
      });
    } catch (capturado) {
      erroY = capturado;
    }
    expect(erroY).toBeNull();
    expect(resultadoY?.tipo).toBe("criada");
    expect(await contar(db, "semantic_extractions")).toBe(2);
  });

  it("id interno da guia é injetivo: surrogate isolado não colide com U+FFFD (#ac-3)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegras();
    await semearImport(db, "imp-1", "chave-imp");
    await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));

    const salvoA = await api.registrarGuia(db, {
      guia: normalizar({ id_guia: "\uD800" }),
      conferencia: conferenciaA(regras),
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
    expect(salvoA.tipo).toBe("criada");

    // O adapter node:sqlite normaliza surrogate isolado para U+FFFD ao gravar
    // `id_guia`, então o id interno de A é lido por U+FFFD.
    const H = await idInternoDaGuia(db, "\uFFFD");
    expect(H).not.toBeNull();

    // Renomeia a coluna `id_guia` de A (normalização do adapter) para isolar a
    // colisão do HASH do id interno: sem nenhuma guia com id_guia U+FFFD,
    // `lerGuia("\uFFFD")` devolve null e a única causa de B reusar o id H é o
    // digest ambíguo de `guia\u0000id`.
    await db
      .prepare("UPDATE guides SET id_guia = ? WHERE id = ?")
      .bind("G-2608-8100", H)
      .run();
    expect(await idInternoDaGuia(db, "\uFFFD")).toBeNull();

    const salvoB = await api.registrarGuia(db, {
      guia: normalizar({ id_guia: "\uFFFD" }),
      conferencia: conferenciaA(regras),
      importId: "imp-1",
      regras,
      agora: DEPOIS,
    });
    expect(salvoB.tipo).toBe("criada");

    // B é conteúdo distinto: cria guia NOVA com id interno diferente de H,
    // nunca anexa a revisão à guia A.
    expect(await contar(db, "guides")).toBe(2);
    const idB = await idInternoDaGuia(db, "\uFFFD");
    expect(idB).not.toBeNull();
    expect(idB).not.toBe(H);
  });
});
