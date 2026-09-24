// Teste travado lt-overlay-convergencia-duplicidade (#ac-7, #ac-8, #ac-9):
//
//   Given assinaturas normalizadas de nove campos iguais para 0027/0057 e
//   0059/0076,
//   When as guias são registradas em ordem direta e reversa, uma escrita
//   concorrente é injetada entre a leitura e a gravação do passe e um membro é
//   corrigido depois,
//   Then os dois pares convergem para o MESMO overlay determinístico de
//   pendência (quatro guias pendentes somando R$ 320,00), o par quebrado perde
//   só o próprio overlay corrente, o passe só resolve depois de reler e
//   confirmar seu efeito, divergência persistente erra após cinco tentativas e
//   um passe extra grava zero statements. Duas outras guias iguais nos outros
//   oito campos mas com data_atendimento inválida não formam grupo nem recebem
//   o overlay e permanecem PENDENTE por data_invalida.
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
}

interface ResultadoPersistencia {
  tipo: "criada" | "reaproveitada" | "conflito_idempotencia";
}

interface ApiAprovada {
  registrarGuia(db: D1Database, opcoes: OpcoesPersistencia): Promise<ResultadoPersistencia>;
  reavaliarDuplicidade(db: D1Database, opcoes: { agora: string }): Promise<{ alteracoes: number }>;
}

const modulos = import.meta.glob("../../src/application/guides/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.registrarGuia).toBe("function");
  expect(typeof api?.reavaliarDuplicidade).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Fixtures determinísticas: células oficiais inline (nada de node:fs)
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";
const DEPOIS = "2026-03-05T10:05:00.000Z";

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

function celulas(over: Partial<GuiaOriginal>): GuiaOriginal {
  return {
    id_guia: "G-2608-0000",
    unidade: "Sul",
    data_atendimento: "2026-08-26",
    paciente: "P-0000",
    convenio: "Vitalcard",
    carteirinha: "000000000",
    cid: "",
    procedimento_codigo: "20103301",
    procedimento_descricao: "Consulta ortopédica",
    numero_autorizacao: "AUT000000",
    autorizacao_validade: "2026-09-19",
    autorizacao_sessoes_limite: "10",
    sessao_numero_na_autorizacao: "7",
    profissional: "Profissional Teste",
    profissional_registro: "CRM-SP 97731",
    valor: "90.00",
    observacao_recepcao: "",
    data_lancamento: "2026-08-28",
    ...over,
  };
}

function normalizar(over: Partial<GuiaOriginal>): GuiaNormalizada {
  const linha: LinhaGuiaCsv = { numero: 1, original: celulas(over), linhaOriginal: "" };
  return normalizarGuia(linha);
}

const GUIA_0027 = (): GuiaNormalizada =>
  normalizar({
    id_guia: "G-2608-0027",
    data_atendimento: "26/08/2026",
    paciente: "P-1051",
    carteirinha: "258573823",
    cid: "S83.5",
    numero_autorizacao: "AUT124496",
    profissional_registro: "CRM-SP 97731",
    valor: "90.00",
  });

const GUIA_0057 = (): GuiaNormalizada =>
  normalizar({
    id_guia: "G-2608-0057",
    data_atendimento: "2026-08-26",
    paciente: "P-1051",
    carteirinha: "258573823",
    cid: "S83.5",
    numero_autorizacao: "AUT124496",
    profissional_registro: "CRM-SP 97731",
    valor: "90.00",
  });

const GUIA_0059 = (): GuiaNormalizada =>
  normalizar({
    id_guia: "G-2608-0059",
    data_atendimento: "2026-08-27",
    paciente: "P-1052",
    carteirinha: "717376382",
    cid: "M79.7",
    procedimento_codigo: "50000560",
    procedimento_descricao: "Sessão de fisioterapia neurofuncional",
    numero_autorizacao: "AUT743137",
    profissional: "Bruno Castanho",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "70.00",
  });

const GUIA_0076 = (): GuiaNormalizada =>
  normalizar({
    id_guia: "G-2608-0076",
    data_atendimento: "2026-08-27",
    paciente: "P-1052",
    carteirinha: "717376382",
    cid: "M79.7",
    procedimento_codigo: "50000560",
    procedimento_descricao: "Sessão de fisioterapia neurofuncional",
    numero_autorizacao: "AUT743137",
    profissional: "Bruno Castanho",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "70.00",
  });

// Terceira guia da MESMA assinatura de nove campos de 0059/0076: só o id_guia
// difere, para provar que a cardinalidade influencia a evidência do overlay.
const GUIA_0099 = (): GuiaNormalizada =>
  normalizar({
    id_guia: "G-2608-0099",
    data_atendimento: "2026-08-27",
    paciente: "P-1052",
    carteirinha: "717376382",
    cid: "M79.7",
    procedimento_codigo: "50000560",
    procedimento_descricao: "Sessão de fisioterapia neurofuncional",
    numero_autorizacao: "AUT743137",
    profissional: "Bruno Castanho",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "70.00",
  });

// Duas guias iguais nos OUTROS oito campos de assinatura, com data inválida.
function guiaDataInvalida(idGuia: string): GuiaNormalizada {
  return normalizar({
    id_guia: idGuia,
    data_atendimento: "31/02/2026",
    paciente: "P-1080",
    carteirinha: "000000000",
    cid: "M79.7",
    procedimento_codigo: "50000560",
    procedimento_descricao: "Sessão de fisioterapia neurofuncional",
    numero_autorizacao: "AUT000000",
    sessao_numero_na_autorizacao: "3",
    profissional: "Bruno Castanho",
    profissional_registro: "CREFITO-3 204411-F",
    valor: "70.00",
  });
}

const NOVE_CAMPOS = [
  "convenio",
  "paciente",
  "carteirinha",
  "numero_autorizacao",
  "data_atendimento",
  "procedimento_codigo",
  "sessao_numero_na_autorizacao",
  "unidade",
  "profissional_registro",
];

function conferenciaOk(regras: Catalogo): ConferenciaPersistivel {
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

function conferenciaDataInvalida(regras: Catalogo): ConferenciaPersistivel {
  return {
    resultado: {
      decisao: "PENDENTE",
      motivos: [
        {
          codigo: "data_invalida",
          severidade: "pendencia",
          campos: ["data_atendimento"],
          regra: "A data deve existir no calendário real.",
          evidencia: 'Valor original "31/02/2026" no campo data_atendimento.',
          orientacao: "Corrija a data para o formato DD/MM/AAAA ou AAAA-MM-DD.",
        },
      ],
      orientacoes: ["Corrija a data para o formato DD/MM/AAAA ou AAAA-MM-DD."],
      limitacoes: [],
      checagem_textual: "nao_aplicavel",
      referencia_temporal: null,
      regras_versao: regras.regrasVersao,
      inferencia_textual: null,
    },
    extracao: null,
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

interface EstadoGuia {
  revisaoId: string;
  valorCentavos: number | null;
  decisao: string;
  overlay: { evidencia: string; campos: string[]; severidade: string } | null;
  codigos: string[];
}

async function idInternoDaGuia(db: D1Database, idGuia: string): Promise<string> {
  const linha = await db
    .prepare("SELECT id FROM guides WHERE id_guia = ?")
    .bind(idGuia)
    .first<{ id: string }>();
  if (!linha) {
    throw new Error(`guia ausente: ${idGuia}`);
  }
  return linha.id;
}

async function estadoDaGuia(db: D1Database, idGuia: string): Promise<EstadoGuia> {
  const guideId = await idInternoDaGuia(db, idGuia);
  const revisao = await db
    .prepare(
      "SELECT id, entrada_normalizada_json FROM guide_revisions WHERE guide_id = ? AND vigente = 1",
    )
    .bind(guideId)
    .first<{ id: string; entrada_normalizada_json: string }>();
  if (!revisao) {
    throw new Error(`revisão vigente ausente: ${idGuia}`);
  }
  const validacao = await db
    .prepare("SELECT id, decisao FROM validations WHERE revision_id = ? AND vigente = 1")
    .bind(revisao.id)
    .first<{ id: string; decisao: string }>();
  const findings = validacao
    ? (
        await db
          .prepare(
            "SELECT codigo, severidade, campos_json, evidencia FROM findings WHERE validation_id = ? ORDER BY ordem ASC",
          )
          .bind(validacao.id)
          .all<{ codigo: string; severidade: string; campos_json: string; evidencia: string }>()
      ).results
    : [];
  const overlayLinha = findings.find((f) => f.codigo === "duplicidade_grupo_candidato");
  const normalizada = JSON.parse(revisao.entrada_normalizada_json) as { valorCentavos?: number };
  return {
    revisaoId: revisao.id,
    valorCentavos: normalizada.valorCentavos ?? null,
    decisao: validacao?.decisao ?? "",
    overlay: overlayLinha
      ? {
          evidencia: overlayLinha.evidencia,
          campos: JSON.parse(overlayLinha.campos_json) as string[],
          severidade: overlayLinha.severidade,
        }
      : null,
    codigos: findings.map((f) => f.codigo),
  };
}

async function registrarTodas(
  db: D1Database,
  regras: Catalogo,
  guias: GuiaNormalizada[],
  conferencia: ConferenciaPersistivel,
): Promise<void> {
  for (const guia of guias) {
    await api!.registrarGuia(db, {
      guia,
      conferencia,
      idempotencyKey: `K-${guia.id}`,
      importId: "imp-1",
      regras,
      agora: AGORA,
    });
  }
}

async function semearBase(db: D1Database): Promise<Catalogo> {
  const regras = carregarRegras();
  await semearImport(db, "imp-1", "chave-imp");
  await semearRuleset(db, "rs-1", hashCatalogo(CATALOGO_JSON));
  return regras;
}

// ---------------------------------------------------------------------------
// Wrapper de D1: conta run() de escrita e injeta antes de cada lote com escrita
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

interface OpcoesWrapper {
  contarEscritas?: boolean;
  aoLoteComEscrita?: () => void | Promise<void>;
}

interface Espiao {
  escritas: number;
  lotesComEscrita: number;
}

function envolverDb(db: D1Database, espiao: Espiao, opcoes: OpcoesWrapper): D1Database {
  const alvo = db as unknown as object;
  return new Proxy(alvo, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (sql: string) =>
          envolverStatement(
            (target as D1Database).prepare(sql),
            { sql, valores: [] },
            (executado) => {
              if (opcoes.contarEscritas && ehEscrita(executado)) {
                espiao.escritas += 1;
              }
            },
          );
      }
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const temEscrita = statements.some((statement) => {
            const registro = registros.get(statement as object);
            return registro !== undefined && ehEscrita(registro.sql);
          });
          if (temEscrita) {
            espiao.lotesComEscrita += 1;
            await opcoes.aoLoteComEscrita?.();
          }
          return (target as D1Database).batch(statements);
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function"
        ? (valor as (...args: unknown[]) => unknown).bind(target)
        : valor;
    },
  }) as unknown as D1Database;
}

async function dissolverGrupo(db: D1Database, idGuiaMembro: string, marca: string): Promise<void> {
  await db
    .prepare(
      `UPDATE guide_revisions SET assinatura_duplicidade = ?
         WHERE vigente = 1
           AND guide_id = (SELECT id FROM guides WHERE id_guia = ?)`,
    )
    .bind(marca, idGuiaMembro)
    .run();
}

async function assinaturaDaGuia(db: D1Database, idGuia: string): Promise<string | null> {
  const linha = await db
    .prepare(
      `SELECT assinatura_duplicidade AS assinatura FROM guide_revisions
         WHERE vigente = 1 AND guide_id = (SELECT id FROM guides WHERE id_guia = ?)`,
    )
    .bind(idGuia)
    .first<{ assinatura: string | null }>();
  return linha?.assinatura ?? null;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("duplicidade: assinatura de nove campos, overlay e convergência", () => {
  it("ordem direta e reversa convergem para o mesmo overlay determinístico (#ac-7, #ac-8, #ac-9)", async () => {
    const api = exigirApi();
    const direta = await criarBanco();
    const reversa = await criarBanco();
    const regras = carregarRegras();
    const hash = hashCatalogo(CATALOGO_JSON);

    for (const db of [direta, reversa]) {
      await semearImport(db, "imp-1", `chave-${direta === db ? "d" : "r"}`);
      await semearRuleset(db, "rs-1", hash);
    }

    const guiasDireta = [GUIA_0027(), GUIA_0057(), GUIA_0059(), GUIA_0076()];
    const guiasReversa = [...guiasDireta].reverse();
    const invalidada1 = guiaDataInvalida("G-2608-9001");
    const invalidada2 = guiaDataInvalida("G-2608-9002");

    await registrarTodas(direta, regras, guiasDireta, conferenciaOk(regras));
    await registrarTodas(
      direta,
      regras,
      [invalidada1, invalidada2],
      conferenciaDataInvalida(regras),
    );
    await registrarTodas(reversa, regras, guiasReversa, conferenciaOk(regras));
    await registrarTodas(
      reversa,
      regras,
      [invalidada1, invalidada2],
      conferenciaDataInvalida(regras),
    );

    const ids = ["G-2608-0027", "G-2608-0057", "G-2608-0059", "G-2608-0076"];
    const evidenciasDireta: Record<string, string> = {};
    const evidenciasReversa: Record<string, string> = {};
    let somaDireta = 0;
    let somaReversa = 0;

    for (const id of ids) {
      const estadoDireta = await estadoDaGuia(direta, id);
      const estadoReversa = await estadoDaGuia(reversa, id);
      expect(estadoDireta.decisao).toBe("PENDENTE");
      expect(estadoReversa.decisao).toBe("PENDENTE");
      expect(estadoDireta.overlay).not.toBeNull();
      expect(estadoReversa.overlay).not.toBeNull();
      expect([...estadoDireta.overlay!.campos].sort()).toEqual([...NOVE_CAMPOS].sort());
      expect([...estadoReversa.overlay!.campos].sort()).toEqual([...NOVE_CAMPOS].sort());
      expect(estadoDireta.overlay!.severidade).toBe("pendencia");
      expect(estadoReversa.overlay!.severidade).toBe("pendencia");
      // A evidência deriva da assinatura + cardinalidade, nunca do id_guia.
      expect(estadoDireta.overlay!.evidencia).not.toContain(id);
      expect(estadoReversa.overlay!.evidencia).not.toContain(id);
      evidenciasDireta[id] = estadoDireta.overlay!.evidencia;
      evidenciasReversa[id] = estadoReversa.overlay!.evidencia;
      somaDireta += estadoDireta.valorCentavos ?? 0;
      somaReversa += estadoReversa.valorCentavos ?? 0;
    }

    // Mesmo overlay determinístico independente da ordem de importação.
    expect(evidenciasReversa).toEqual(evidenciasDireta);
    expect(somaDireta).toBe(32000);
    expect(somaReversa).toBe(32000);

    // Assinaturas distintas produzem evidências distintas: o grupo 0027/0057
    // não compartilha a evidência do grupo 0059/0076 (sem presumir formato).
    expect(evidenciasDireta["G-2608-0027"]).not.toBe(evidenciasDireta["G-2608-0059"]);

    // As duas guias de data inválida não formam grupo nem recebem o overlay.
    for (const id of ["G-2608-9001", "G-2608-9002"]) {
      const estado = await estadoDaGuia(direta, id);
      expect(estado.decisao).toBe("PENDENTE");
      expect(estado.overlay).toBeNull();
      expect(estado.codigos).toContain("data_invalida");
      expect(estado.codigos).not.toContain("duplicidade_grupo_candidato");
    }

    // Cardinalidade é parte da evidência: a mesma assinatura de 0059/0076 com
    // uma terceira guia (só o id_guia difere) tem overlay presente nos três, e
    // a evidência do trio difere da evidência observada para o par de MESMO
    // formato — sem afirmar a forma textual.
    const trio = await criarBanco();
    await semearImport(trio, "imp-1", "chave-t");
    await semearRuleset(trio, "rs-1", hash);
    await registrarTodas(
      trio,
      regras,
      [GUIA_0059(), GUIA_0076(), GUIA_0099()],
      conferenciaOk(regras),
    );
    await api.reavaliarDuplicidade(trio, { agora: DEPOIS });

    const evidenciasTrio: string[] = [];
    for (const id of ["G-2608-0059", "G-2608-0076", "G-2608-0099"]) {
      const estado = await estadoDaGuia(trio, id);
      expect(estado.decisao).toBe("PENDENTE");
      expect(estado.overlay).not.toBeNull();
      expect(estado.overlay!.severidade).toBe("pendencia");
      expect(estado.overlay!.evidencia).not.toContain(id);
      expect([...estado.overlay!.campos].sort()).toEqual([...NOVE_CAMPOS].sort());
      evidenciasTrio.push(estado.overlay!.evidencia);
    }
    expect(new Set(evidenciasTrio).size).toBe(1);
    expect(evidenciasTrio[0]).not.toBe(evidenciasDireta["G-2608-0059"]);
  });

  it("membro corrigido quebra só o próprio par e preserva o outro overlay (#ac-8)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = await semearBase(db);
    await registrarTodas(db, regras, [GUIA_0027(), GUIA_0057(), GUIA_0059(), GUIA_0076()], conferenciaOk(regras));

    await api.registrarGuia(db, {
      guia: normalizar({
        id_guia: "G-2608-0057",
        data_atendimento: "2026-08-26",
        paciente: "P-9999",
        carteirinha: "258573823",
        cid: "S83.5",
        numero_autorizacao: "AUT124496",
        profissional_registro: "CRM-SP 97731",
        valor: "90.00",
      }),
      conferencia: conferenciaOk(regras),
      idempotencyKey: "K-correcao-0057",
      importId: "imp-1",
      regras,
      agora: DEPOIS,
    });

    const estado0027 = await estadoDaGuia(db, "G-2608-0027");
    const estado0057 = await estadoDaGuia(db, "G-2608-0057");
    const estado0059 = await estadoDaGuia(db, "G-2608-0059");
    const estado0076 = await estadoDaGuia(db, "G-2608-0076");

    expect(estado0027.overlay).toBeNull();
    expect(estado0057.overlay).toBeNull();
    expect(estado0059.overlay).not.toBeNull();
    expect(estado0076.overlay).not.toBeNull();

    // Histórico preservado: 0057 mantém a revisão anterior e ganha a corrigida.
    const historico = await db
      .prepare(
        "SELECT numero, vigente FROM guide_revisions WHERE guide_id = (SELECT id FROM guides WHERE id_guia = ?) ORDER BY numero ASC",
      )
      .bind("G-2608-0057")
      .all<{ numero: number; vigente: number }>();
    expect(historico.results.map((r) => r.numero)).toEqual([1, 2]);
    expect(historico.results.map((r) => r.vigente)).toEqual([0, 1]);
  });

  it("escrita concorrente entre leitura e gravação: o passe relê, converge e não deixa overlay obsoleto", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = await semearBase(db);
    await registrarTodas(db, regras, [GUIA_0027(), GUIA_0057(), GUIA_0059(), GUIA_0076()], conferenciaOk(regras));

    // Divergência inicial: remove o overlay persistido, forçando o passe a gravar.
    await db.prepare("DELETE FROM findings WHERE codigo = 'duplicidade_grupo_candidato'").run();

    const espiao: Espiao = { escritas: 0, lotesComEscrita: 0 };
    let injecoes = 0;
    const dbEnvolvido = envolverDb(db, espiao, {
      aoLoteComEscrita: async () => {
        if (injecoes > 0) {
          return;
        }
        injecoes += 1;
        await dissolverGrupo(db, "G-2608-0059", "dissolvida-0059");
      },
    });

    const resultado = await api.reavaliarDuplicidade(dbEnvolvido, { agora: DEPOIS });

    expect(injecoes).toBe(1);
    expect(resultado.alteracoes).toBeGreaterThan(0);

    // Composição final: 0027/0057 continuam par; 0059/0076 foram dissolvidos.
    const estado0027 = await estadoDaGuia(db, "G-2608-0027");
    const estado0057 = await estadoDaGuia(db, "G-2608-0057");
    const estado0059 = await estadoDaGuia(db, "G-2608-0059");
    const estado0076 = await estadoDaGuia(db, "G-2608-0076");
    expect(estado0027.overlay).not.toBeNull();
    expect(estado0057.overlay).not.toBeNull();
    expect(estado0059.overlay).toBeNull();
    expect(estado0076.overlay).toBeNull();
  });

  it("divergência persistente erra após cinco tentativas", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = await semearBase(db);
    await registrarTodas(db, regras, [GUIA_0027(), GUIA_0057(), GUIA_0059(), GUIA_0076()], conferenciaOk(regras));

    await db.prepare("DELETE FROM findings WHERE codigo = 'duplicidade_grupo_candidato'").run();
    const assinatura0076 = await assinaturaDaGuia(db, "G-2608-0076");

    const espiao: Espiao = { escritas: 0, lotesComEscrita: 0 };
    let injecoes = 0;
    const dbEnvolvido = envolverDb(db, espiao, {
      aoLoteComEscrita: async () => {
        const atual = await assinaturaDaGuia(db, "G-2608-0059");
        // Alterna entre o par (assinatura de 0076) e uma assinatura isolada, de
        // modo que cada tentativa leia uma composição e grave sobre outra.
        const novo = atual === assinatura0076 ? `${assinatura0076}-dissolvida` : assinatura0076;
        injecoes += 1;
        await db
          .prepare(
            `UPDATE guide_revisions SET assinatura_duplicidade = ?
               WHERE vigente = 1 AND guide_id = (SELECT id FROM guides WHERE id_guia = ?)`,
          )
          .bind(novo, "G-2608-0059")
          .run();
      },
    });

    await expect(api.reavaliarDuplicidade(dbEnvolvido, { agora: DEPOIS })).rejects.toThrow();
    // A divergência persistente esgota exatamente as cinco tentativas antes de
    // devolver o erro explícito.
    expect(injecoes).toBe(5);
  });

  it("passe extra sobre estado consistente retorna zero alterações e grava zero statements", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = await semearBase(db);
    await registrarTodas(
      db,
      regras,
      [GUIA_0027(), GUIA_0057(), GUIA_0059(), GUIA_0076()],
      conferenciaOk(regras),
    );
    await registrarTodas(
      db,
      regras,
      [guiaDataInvalida("G-2608-9001"), guiaDataInvalida("G-2608-9002")],
      conferenciaDataInvalida(regras),
    );

    const espiao: Espiao = { escritas: 0, lotesComEscrita: 0 };
    const dbEnvolvido = envolverDb(db, espiao, { contarEscritas: true });

    const resultado = await api.reavaliarDuplicidade(dbEnvolvido, { agora: DEPOIS });

    expect(resultado).toEqual({ alteracoes: 0 });
    expect(espiao.escritas).toBe(0);
  });

  it("assinatura de nove campos é injetiva: NUL entre paciente e carteirinha não agrupa atendimentos distintos (#ac-7)", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = await semearBase(db);

    // X e Y têm conteúdo cru DIFERENTE nos nove campos, mas o join interno com
    // "\u0000" produz a MESMA string: fronteira paciente="PA\u0000B" +
    // carteirinha="C" versus paciente="PA" + carteirinha="B\u0000C".
    const X = normalizar({
      id_guia: "G-2608-9101",
      data_atendimento: "2026-08-26",
      paciente: "PA\u0000B",
      carteirinha: "C",
    });
    const Y = normalizar({
      id_guia: "G-2608-9102",
      data_atendimento: "2026-08-26",
      paciente: "PA",
      carteirinha: "B\u0000C",
    });
    expect(X.paciente).not.toBe(Y.paciente);
    expect(X.carteirinha).not.toBe(Y.carteirinha);

    await registrarTodas(db, regras, [X, Y], conferenciaOk(regras));

    // As duas assinaturas são DIFERENTES: nenhuma guia pode ser agrupada como
    // duplicidade candidata.
    const estadoX = await estadoDaGuia(db, "G-2608-9101");
    const estadoY = await estadoDaGuia(db, "G-2608-9102");
    expect(estadoX.overlay).toBeNull();
    expect(estadoY.overlay).toBeNull();
    expect(estadoX.codigos).not.toContain("duplicidade_grupo_candidato");
    expect(estadoY.codigos).not.toContain("duplicidade_grupo_candidato");
  });
});
