// Testes travados da orquestração de importação retomável
// (lt-chunks-falhas-status #ac-1/#ac-2, lt-claim-fence-geracao #ac-2/#ac-5/#ac-6,
//  lt-idempotencia-reimportacao-corpus #ac-3/#ac-5/#ac-7/#ac-8/#ac-9/#ac-11):
//
//   - iniciarImportacao registra o ruleset pelo hash, persiste TODA linha física
//     (aceita ⇒ PENDENTE; rejeitada pelo parser ⇒ FALHOU com motivo) e deriva o
//     status, sem processar guia alguma;
//   - processarProximoChunk libera apenas lease expirado (5 min, `agora`
//     injetado), reivindica até `tamanhoChunk` (25 default) pendentes numa única
//     reserva com token monotônico `dono:geracao`, chama a porta fora do batch e
//     aplica statements + transição terminal guardados; progresso == contagem de
//     `import_lines`; erro da porta vira FALHOU daquela linha;
//   - idempotência por UNIQUE de imports.idempotency_key: corrida com a mesma
//     chave devolve um único lote vencedor sem linhas duplicadas; replay
//     idêntico não escreve; payload divergente erra;
//   - o corpus oficial converge (direto e reverso) para 80 guias, 44 OK,
//     36 PENDENTE, 569400 centavos, com 0027/0057/0059/0076 PENDENTE e 32000
//     centavos sob revisão; após A→B, reimportar A com nova chave marca
//     REAPROVEITADO sem ressuscitar A.
//
// O barrel `src/application/imports/index.ts` entra por `import.meta.glob` (a SUT
// ainda não existe): a primeira asserção é de superfície, de modo que o RED é
// falha de asserção, nunca erro de coleta/import. As ENTRADAS usam só módulos já
// integrados (`src/domain`, `src/semantic`, `src/storage`, `tests/storage/support/banco`).
// Sem `node:fs`, sem rede, sem dependência nova, sem relógio de parede.
import { describe, expect, it } from "vitest";

import csv from "../../docs/fontes/guias.csv?raw";
import regrasRaw from "../../docs/fontes/regras_convenio.json?raw";
import oraculoRaw from "../semantic/fixtures/oraculo-corpus.json?raw";

import { criarBanco } from "../storage/support/banco";
import {
  carregarCatalogo,
  hashCatalogo,
  normalizarGuia,
  parseGuiasCsv,
} from "../../src/domain";
import type {
  Catalogo,
  GuiaNormalizada,
  GuiaOriginal,
  LinhaGuiaCsv,
  ResultadoVerificacao,
} from "../../src/domain";
import {
  MODELO_OBSERVACAO,
  conferirGuia,
  criarQuotaDeChamadas,
  versaoEfetivaDoPrompt,
} from "../../src/semantic";
import type { EntradaObservacao, InterpretadorObservacao, RespostaBruta } from "../../src/semantic";
import { contarLinhasPorEstado } from "../../src/storage";
import { registrarGuia } from "../../src/application/guides";
import { sha256Hex } from "../../src/shared/sha256";

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

type StatusImportacao = "PROCESSANDO" | "CONCLUIDO" | "PARCIAL" | "FALHOU";

interface ProgressoImportacao {
  encontradas: number;
  pendentes: number;
  emAndamento: number;
  processadas: number;
  reaproveitadas: number;
  comFalha: number;
}

interface LoteImportacao {
  id: string;
  idempotencyKey: string;
  arquivoHash: string;
  regrasHash: string;
  status: StatusImportacao;
  tamanhoChunk: number;
  linhasEncontradas: number;
  progresso: ProgressoImportacao;
}

interface OpcoesIniciarImportacao {
  csv: string;
  arquivoNome: string;
  idempotencyKey: string;
  regras: Catalogo;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
  tamanhoChunk?: number;
}

interface OpcoesProcessarChunk {
  loteId: string;
  dono: string;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
}

interface OpcoesContinuar {
  loteId: string;
  conferir: (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel>;
  agora: string;
  tamanhoChunk?: number;
}

interface ApiAprovada {
  iniciarImportacao(db: D1Database, o: OpcoesIniciarImportacao): Promise<LoteImportacao>;
  processarProximoChunk(db: D1Database, o: OpcoesProcessarChunk): Promise<ProgressoImportacao>;
  continuarImportacao(db: D1Database, o: OpcoesContinuar): Promise<ProgressoImportacao>;
  importarLote(
    db: D1Database,
    o: OpcoesIniciarImportacao,
  ): Promise<{ lote: LoteImportacao; progresso: ProgressoImportacao }>;
  lerProgresso(db: D1Database, loteId: string): Promise<LoteImportacao | null>;
  finalizarLoteSeTerminal(
    db: D1Database,
    o: { loteId: string; agora: string },
  ): Promise<LoteImportacao>;
}

const modulos = import.meta.glob("../../src/application/imports/index.ts", { eager: true });
const api = Object.values(modulos)[0] as unknown as ApiAprovada | undefined;

function exigirApi(): ApiAprovada {
  expect(typeof api?.iniciarImportacao).toBe("function");
  expect(typeof api?.processarProximoChunk).toBe("function");
  expect(typeof api?.continuarImportacao).toBe("function");
  expect(typeof api?.importarLote).toBe("function");
  expect(typeof api?.lerProgresso).toBe("function");
  expect(typeof api?.finalizarLoteSeTerminal).toBe("function");
  return api as ApiAprovada;
}

// ---------------------------------------------------------------------------
// Fixtures determinísticas
// ---------------------------------------------------------------------------

const AGORA = "2026-03-05T10:00:00.000Z";
const UM_MINUTO_DEPOIS = "2026-03-05T10:01:00.000Z";
const SEIS_MINUTOS_DEPOIS = "2026-03-05T10:06:00.000Z";

const CATALOGO_JSON = {
  versao: "teste-importacao-lote-2026",
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

function carregarRegrasSinteticas(): Catalogo {
  const resultado = carregarCatalogo(CATALOGO_JSON);
  if (!resultado.ok) {
    throw new Error(`catálogo sintético inválido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

function carregarRegrasReais(): Catalogo {
  const resultado = carregarCatalogo(JSON.parse(regrasRaw));
  if (!resultado.ok) {
    throw new Error(`catálogo real deveria ser válido: ${resultado.erros.join("; ")}`);
  }
  return resultado.catalogo;
}

const CABECALHO =
  "id_guia,unidade,data_atendimento,paciente,convenio,carteirinha,cid,procedimento_codigo,procedimento_descricao,numero_autorizacao,autorizacao_validade,autorizacao_sessoes_limite,sessao_numero_na_autorizacao,profissional,profissional_registro,valor,observacao_recepcao,data_lancamento";

function linhaSintetica(indice: number): string {
  const id = `G-2608-${String(1000 + indice).padStart(4, "0")}`;
  return [
    id,
    "Sul",
    "26/08/2026",
    `P-${1000 + indice}`,
    "Vitalcard",
    "258573823",
    "S83.5",
    "20103301",
    "Consulta ortopédica",
    `AUT${1000 + indice}`,
    "2026-09-19",
    "10",
    "7",
    "Dr. Otávio Prado",
    "CRM-SP 97731",
    "90.00",
    "",
    "2026-08-28",
  ].join(",");
}

const ID_QUE_FALHA = "G-2608-1010";

function csvComUmaRejeicao(): string {
  const linhas: string[] = [CABECALHO];
  for (let indice = 1; indice <= 80; indice += 1) {
    // A 40ª linha física de dados é rejeitada pelo parser (cardinalidade).
    linhas.push(
      indice === 40 ? "G-2608-1040,Sul,apenas,cinco,colunas" : linhaSintetica(indice),
    );
  }
  return `${linhas.join("\n")}\n`;
}

function csvInteiramenteRejeitado(): string {
  return `${[CABECALHO, "so,duas", "tres,quatro,cinco", "linha,curta"].join("\n")}\n`;
}

function conferenciaSintetica(regras: Catalogo): ConferenciaPersistivel {
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

function portaSintetica(regras: Catalogo): (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel> {
  return async () => conferenciaSintetica(regras);
}

function portaComFalha(
  regras: Catalogo,
  idQueFalha: string,
): (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel> {
  return async (guia) => {
    if (guia.id === idQueFalha) {
      throw new Error(`porta_semantica_indisponivel:${guia.id}`);
    }
    return conferenciaSintetica(regras);
  };
}

interface OraculoFixture {
  versao: number;
  porTexto: Record<
    string,
    { sinais: unknown[]; situacao: unknown; ambiguidades: unknown[] }
  >;
}

function carregarOraculo(): OraculoFixture {
  return JSON.parse(oraculoRaw) as OraculoFixture;
}

/**
 * Porta do corpus: o resultado determinístico vem de `conferirGuia` com o
 * interpretador de fixture decidido por CONTEÚDO (nunca por id) e a extração
 * persistível é montada do oráculo quando a observação é não vazia após trim.
 */
function criarPortaCorpus(
  regras: Catalogo,
  oraculo: OraculoFixture,
): (guia: GuiaNormalizada) => Promise<ConferenciaPersistivel> {
  const quota = criarQuotaDeChamadas({ limite: 100000 });
  const interpretador: InterpretadorObservacao = {
    async extrair(entrada: EntradaObservacao): Promise<RespostaBruta> {
      const achado = oraculo.porTexto[entrada.observacao_recepcao];
      if (achado === undefined) {
        throw new Error(`texto não mapeado no oráculo: ${entrada.observacao_recepcao}`);
      }
      return {
        texto: JSON.stringify(achado),
        modelo: MODELO_OBSERVACAO,
        promptVersao: versaoEfetivaDoPrompt(),
      };
    },
  };
  return async (guia) => {
    const resultado = await conferirGuia(guia, regras, { interpretador, quota });
    const texto = guia.observacaoRecepcao;
    const extracao =
      texto.trim() === ""
        ? null
        : {
            observacaoHash: sha256Hex(texto),
            modelo: MODELO_OBSERVACAO,
            promptVersao: versaoEfetivaDoPrompt(),
            sinais: oraculo.porTexto[texto]!.sinais,
            situacao: oraculo.porTexto[texto]!.situacao,
            ambiguidades: oraculo.porTexto[texto]!.ambiguidades,
          };
    return { resultado, extracao };
  };
}

// ---------------------------------------------------------------------------
// Leituras diretas do D1 e utilitários
// ---------------------------------------------------------------------------

interface LinhaImportacaoDb {
  id: string;
  import_id: string;
  numero_linha: number;
  estado: string;
  linha_original: string;
  original_json: string | null;
  guia_id: string | null;
  revisao_id: string | null;
  motivo: string | null;
  dono: string | null;
  reservado_em: string | null;
  atualizado_em: string;
}

async function linhasDoLote(db: D1Database, loteId: string): Promise<LinhaImportacaoDb[]> {
  const { results } = await db
    .prepare(
      `SELECT id, import_id, numero_linha, estado, linha_original, original_json,
              guia_id, revisao_id, motivo, dono, reservado_em, atualizado_em
         FROM import_lines WHERE import_id = ? ORDER BY numero_linha ASC`,
    )
    .bind(loteId)
    .all<LinhaImportacaoDb>();
  return results;
}

async function contar(db: D1Database, tabela: string): Promise<number> {
  const linha = await db
    .prepare(`SELECT COUNT(*) AS total FROM ${tabela}`)
    .first<{ total: number }>();
  return Number(linha?.total ?? 0);
}

async function contagens(db: D1Database): Promise<Record<string, number>> {
  const tabelas = [
    "imports",
    "import_lines",
    "rulesets",
    "guides",
    "guide_revisions",
    "validations",
    "findings",
    "semantic_extractions",
  ];
  const saida: Record<string, number> = {};
  for (const tabela of tabelas) {
    saida[tabela] = await contar(db, tabela);
  }
  return saida;
}

async function esperarPor(condicao: () => boolean, tentativas = 1000): Promise<void> {
  for (let indice = 0; indice < tentativas; indice += 1) {
    if (condicao()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condição não satisfeita a tempo");
}

async function esperarAte(condicao: () => Promise<boolean>, tentativas = 1000): Promise<void> {
  for (let indice = 0; indice < tentativas; indice += 1) {
    if (await condicao()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condição não satisfeita a tempo");
}

function geracaoDoToken(token: string): number {
  return Number.parseInt(token.split(":")[1] ?? "0", 10);
}

interface EstadoGuiaAtual {
  revisaoId: string;
  valorCentavos: number | null;
  decisao: string;
  codigos: string[];
}

async function estadoAtual(db: D1Database, idGuia: string): Promise<EstadoGuiaAtual> {
  const guia = await db
    .prepare("SELECT id FROM guides WHERE id_guia = ?")
    .bind(idGuia)
    .first<{ id: string }>();
  if (!guia) {
    throw new Error(`guia ausente: ${idGuia}`);
  }
  const revisao = await db
    .prepare(
      "SELECT id, entrada_normalizada_json FROM guide_revisions WHERE guide_id = ? AND vigente = 1",
    )
    .bind(guia.id)
    .first<{ id: string; entrada_normalizada_json: string }>();
  if (!revisao) {
    throw new Error(`revisão vigente ausente: ${idGuia}`);
  }
  const validacao = await db
    .prepare("SELECT id, decisao FROM validations WHERE revision_id = ? AND vigente = 1")
    .bind(revisao.id)
    .first<{ id: string; decisao: string }>();
  const codigos = validacao
    ? (
        await db
          .prepare("SELECT codigo FROM findings WHERE validation_id = ?")
          .bind(validacao.id)
          .all<{ codigo: string }>()
      ).results.map((linha) => linha.codigo)
    : [];
  const normalizada = JSON.parse(revisao.entrada_normalizada_json) as {
    valorCentavos?: number | null;
  };
  return {
    revisaoId: revisao.id,
    valorCentavos: normalizada.valorCentavos ?? null,
    decisao: validacao?.decisao ?? "",
    codigos,
  };
}

const CANDIDATOS_DUPLICIDADE = [
  "G-2608-0027",
  "G-2608-0057",
  "G-2608-0059",
  "G-2608-0076",
];

function csvInvertido(texto: string): string {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const corpo = linhas[linhas.length - 1] === "" ? linhas.slice(0, -1) : linhas;
  const [cabecalho, ...dados] = corpo;
  return `${[cabecalho, ...[...dados].reverse()].join("\n")}\n`;
}

async function assertConvergenciaCorpus(db: D1Database): Promise<void> {
  expect(await contar(db, "guides")).toBe(80);

  const decisoes = await db
    .prepare("SELECT decisao, COUNT(*) AS total FROM validations WHERE vigente = 1 GROUP BY decisao")
    .all<{ decisao: string; total: number }>();
  const porDecisao = Object.fromEntries(
    decisoes.results.map((linha) => [linha.decisao, Number(linha.total)]),
  );
  expect(porDecisao.OK).toBe(44);
  expect(porDecisao.PENDENTE).toBe(36);

  const vigentes = await db
    .prepare("SELECT entrada_normalizada_json FROM guide_revisions WHERE vigente = 1")
    .all<{ entrada_normalizada_json: string }>();
  const totalCentavos = vigentes.results.reduce((soma, linha) => {
    const normalizada = JSON.parse(linha.entrada_normalizada_json) as {
      valorCentavos?: number | null;
    };
    return soma + (normalizada.valorCentavos ?? 0);
  }, 0);
  expect(totalCentavos).toBe(569400);

  let centavosSobRevisao = 0;
  for (const id of CANDIDATOS_DUPLICIDADE) {
    const estado = await estadoAtual(db, id);
    expect(estado.decisao).toBe("PENDENTE");
    expect(estado.codigos).toContain("duplicidade_grupo_candidato");
    centavosSobRevisao += estado.valorCentavos ?? 0;
  }
  expect(centavosSobRevisao).toBe(32000);
}

// ---------------------------------------------------------------------------
// lt-chunks-falhas-status (#ac-1, #ac-2)
// ---------------------------------------------------------------------------

describe("lt-chunks-falhas-status: chunks, falhas e status durável", () => {
  it("chunks de 25 registram 80 linhas físicas, progresso do banco e PARCIAL", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegrasSinteticas();
    const lote = await api.iniciarImportacao(db, {
      csv: csvComUmaRejeicao(),
      arquivoNome: "guias-sinteticas.csv",
      idempotencyKey: "K-chunks",
      regras,
      conferir: portaComFalha(regras, ID_QUE_FALHA),
      agora: AGORA,
    });

    // iniciarImportacao só inicializa: 80 linhas físicas duráveis (79 PENDENTE
    // de parser + 1 FALHOU de parser), nada processado e o ruleset registrado.
    expect(lote.linhasEncontradas).toBe(80);
    expect(lote.tamanhoChunk).toBe(25);
    expect(lote.idempotencyKey).toBe("K-chunks");
    expect(lote.arquivoHash).not.toBe("");
    expect(lote.regrasHash).toBe(regras.hash);
    expect(await contar(db, "import_lines")).toBe(80);
    expect(await contar(db, "guides")).toBe(0);
    const rulesets = await db
      .prepare("SELECT hash FROM rulesets")
      .all<{ hash: string }>();
    expect(rulesets.results.map((linha) => linha.hash)).toEqual([regras.hash]);

    const inicial = (await api.lerProgresso(db, lote.id))!;
    expect(inicial.progresso).toEqual(await contarLinhasPorEstado(db, lote.id));
    expect(inicial.progresso.pendentes).toBe(79);
    expect(inicial.progresso.comFalha).toBe(1);
    expect(inicial.progresso.processadas).toBe(0);
    expect(inicial.status).toBe("PROCESSANDO");

    // Quatro chamadas separadas processam os 79 pendentes em chunks de 25/25/25/4
    // (G-2608-1010 é aceita, mas a porta falha já no primeiro chunk e a linha vira
    // FALHOU). Os deltas explícitos provam que cada chamada consome exatamente 25,
    // 25, 25 e 4 pendentes: um lote que processasse tudo na primeira chamada não
    // satisfaria 24/49/74/78 processadas.
    const pendentesPorChamada = [54, 29, 4, 0];
    const processadasPorChamada = [24, 49, 74, 78];
    for (let indice = 0; indice < 4; indice += 1) {
      const progresso = await api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: `worker-chunks-${indice}`,
        conferir: portaComFalha(regras, ID_QUE_FALHA),
        agora: AGORA,
      });
      expect(progresso).toEqual(await contarLinhasPorEstado(db, lote.id));
      expect(progresso.pendentes).toBe(pendentesPorChamada[indice]);
      expect(progresso.processadas).toBe(processadasPorChamada[indice]);
    }

    const final = (await api.lerProgresso(db, lote.id))!;
    expect(final.progresso).toEqual(await contarLinhasPorEstado(db, lote.id));
    expect(final.progresso.pendentes).toBe(0);
    expect(final.progresso.emAndamento).toBe(0);
    expect(final.progresso.processadas).toBe(78);
    expect(final.progresso.comFalha).toBe(2);
    expect(final.progresso.encontradas).toBe(80);
    expect(final.status).toBe("PARCIAL");
    expect(final.status).not.toBe("CONCLUIDO");
    // As linhas bem-sucedidas permanecem: uma guia por linha PROCESSADO.
    expect(await contar(db, "guides")).toBe(78);

    // Os dois erros nomeiam as duas linhas: o parser pela cardinalidade e o
    // texto cru; a porta pelo id da guia na própria linha.
    const falhas = (await linhasDoLote(db, lote.id)).filter(
      (linha) => linha.estado === "FALHOU",
    );
    expect(falhas).toHaveLength(2);
    const falhaParser = falhas.find((linha) => /cardinalidade/i.test(linha.motivo ?? ""));
    expect(falhaParser?.linha_original).toContain("apenas");
    const falhaPorta = falhas.find((linha) => linha !== falhaParser);
    expect(falhaPorta).toBeDefined();
    expect(`${falhaPorta?.motivo ?? ""} ${falhaPorta?.original_json ?? ""}`).toContain(
      ID_QUE_FALHA,
    );

    // finalizarLoteSeTerminal recomputa o mesmo status derivado.
    const finalizado = await api.finalizarLoteSeTerminal(db, { loteId: lote.id, agora: AGORA });
    expect(finalizado.status).toBe("PARCIAL");
  });

  it("CSV 100% rejeitado finaliza FALHOU sem linha processável", async () => {
    const api = exigirApi();
    const db = await criarBanco();
    const regras = carregarRegrasSinteticas();
    const lote = await api.iniciarImportacao(db, {
      csv: csvInteiramenteRejeitado(),
      arquivoNome: "rejeitado.csv",
      idempotencyKey: "K-rejeitado",
      regras,
      conferir: portaSintetica(regras),
      agora: AGORA,
    });

    expect(lote.linhasEncontradas).toBe(3);
    expect(lote.status).toBe("FALHOU");

    // Zero reivindicações: continuarImportacao não deixa PROCESSANDO e deriva
    // FALHOU pela ausência total de sucesso.
    const progresso = await api.continuarImportacao(db, {
      loteId: lote.id,
      conferir: portaSintetica(regras),
      agora: AGORA,
    });
    expect(progresso.pendentes).toBe(0);
    expect(progresso.emAndamento).toBe(0);
    expect(progresso.processadas).toBe(0);
    expect(progresso.comFalha).toBe(3);
    expect(progresso).toEqual(await contarLinhasPorEstado(db, lote.id));

    const lido = (await api.lerProgresso(db, lote.id))!;
    expect(lido.progresso).toEqual(await contarLinhasPorEstado(db, lote.id));
    expect(lido.status).toBe("FALHOU");
    expect(await contar(db, "guides")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// lt-claim-fence-geracao (#ac-2, #ac-5, #ac-6)
// ---------------------------------------------------------------------------

describe("lt-claim-fence-geracao: reserva atômica, lease e fencing", () => {
  it(
    "token expirado não persiste nem transiciona; o dono vigente vence sozinho",
    async () => {
      const api = exigirApi();
      const db = await criarBanco();
      const regras = carregarRegrasSinteticas();
      const lote = await api.iniciarImportacao(db, {
        csv: `${[CABECALHO, linhaSintetica(1), linhaSintetica(2)].join("\n")}\n`,
        arquivoNome: "duas-linhas.csv",
        idempotencyKey: "K-fence",
        regras,
        conferir: portaSintetica(regras),
        agora: AGORA,
      });
      expect(await contar(db, "import_lines")).toBe(2);

      // A porta segura as duas primeiras invocações (dono velho e dono novo)
      // para que o teste leia a posse entre a reserva e o commit.
      let invocacoes = 0;
      const bloqueios: Array<() => void> = [];
      const conferir = async (_guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        invocacoes += 1;
        if (invocacoes <= 2) {
          await new Promise<void>((resolve) => {
            bloqueios.push(resolve);
          });
        }
        return conferenciaSintetica(regras);
      };

      // Primeira reserva: as DUAS pendentes são reivindicadas numa única posse
      // compartilhando token e reservado_em.
      const primeiro = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir,
        agora: AGORA,
      });
      await esperarPor(() => invocacoes >= 1);
      const aposPrimeiraReserva = await linhasDoLote(db, lote.id);
      expect(aposPrimeiraReserva.every((linha) => linha.estado === "EM_ANDAMENTO")).toBe(true);
      const tokenVelho = aposPrimeiraReserva[0]!.dono!;
      expect(tokenVelho).toMatch(/^worker:\d+$/);
      expect(aposPrimeiraReserva.every((linha) => linha.dono === tokenVelho)).toBe(true);
      expect(new Set(aposPrimeiraReserva.map((linha) => linha.reservado_em)).size).toBe(1);

      // Segunda reserva: o MESMO nome de dono reutilizado; passados seis
      // minutos o lease de cinco expira e as linhas são reivindicadas de novo
      // com uma geração monotônica distinta.
      const segundo = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir,
        agora: SEIS_MINUTOS_DEPOIS,
      });
      await esperarPor(() => invocacoes >= 2);
      const aposSegundaReserva = await linhasDoLote(db, lote.id);
      const tokenNovo = aposSegundaReserva[0]!.dono!;
      expect(tokenNovo).toMatch(/^worker:\d+$/);
      expect(tokenNovo).not.toBe(tokenVelho);
      expect(geracaoDoToken(tokenNovo)).toBeGreaterThan(geracaoDoToken(tokenVelho));
      expect(aposSegundaReserva.every((linha) => linha.dono === tokenNovo)).toBe(true);

      // Libera o dono VELHO: seu lote inteiro é no-op; nenhuma guia, nenhuma
      // transição terminal indevida e a posse vigente permanece.
      bloqueios[0]!();
      await primeiro;
      const aposDonoVelho = await linhasDoLote(db, lote.id);
      expect(aposDonoVelho.every((linha) => linha.estado === "EM_ANDAMENTO")).toBe(true);
      expect(aposDonoVelho.every((linha) => linha.dono === tokenNovo)).toBe(true);
      expect(await contar(db, "guides")).toBe(0);
      expect(await contar(db, "guide_revisions")).toBe(0);

      // Libera o dono VIGENTE: só ele alcança o estado terminal, sem revisão
      // órfã nem linha terminal sobrescrita.
      bloqueios[1]!();
      await segundo;
      const finais = await linhasDoLote(db, lote.id);
      expect(finais.every((linha) => linha.estado === "PROCESSADO")).toBe(true);
      expect(await contar(db, "guides")).toBe(2);
      expect(await contar(db, "guide_revisions")).toBe(2);
      expect(await contar(db, "validations")).toBe(2);

      const progresso = (await api.lerProgresso(db, lote.id))!;
      expect(progresso.status).toBe("CONCLUIDO");
      expect(progresso.progresso.processadas).toBe(2);
      expect(progresso.progresso.comFalha).toBe(0);
      expect(progresso.progresso.emAndamento).toBe(0);
    },
    30000,
  );

  it(
    "duas reivindicações concorrentes pegam linhas distintas com token monotônico",
    async () => {
      const api = exigirApi();
      const db = await criarBanco();
      const regras = carregarRegrasSinteticas();
      const lote = await api.iniciarImportacao(db, {
        csv: `${[
          CABECALHO,
          linhaSintetica(1),
          linhaSintetica(2),
          linhaSintetica(3),
          linhaSintetica(4),
        ].join("\n")}\n`,
        arquivoNome: "quatro-linhas.csv",
        idempotencyKey: "K-concorrencia",
        regras,
        conferir: portaSintetica(regras),
        agora: AGORA,
        tamanhoChunk: 1,
      });
      expect(await contar(db, "import_lines")).toBe(4);

      // Worker A segura a porta depois de reivindicar UMA linha (chunk = 1).
      let portAIniciou = false;
      let liberarPortA!: () => void;
      const portA = async (_guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        portAIniciou = true;
        await new Promise<void>((resolve) => {
          liberarPortA = resolve;
        });
        return conferenciaSintetica(regras);
      };
      const chamadaA = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir: portA,
        agora: AGORA,
      });
      await esperarPor(() => portAIniciou);
      await esperarAte(
        async () =>
          (await linhasDoLote(db, lote.id)).filter((linha) => linha.estado === "EM_ANDAMENTO")
            .length === 1,
      );
      const reservaA = (await linhasDoLote(db, lote.id)).filter(
        (linha) => linha.estado === "EM_ANDAMENTO",
      );
      expect(reservaA).toHaveLength(1);
      const linhaA = reservaA[0]!.id;
      const tokenA = reservaA[0]!.dono!;
      expect(tokenA).toMatch(/^worker:\d+$/);

      // Worker B, MESMO dono reutilizado e mesmo `agora` (lease ainda válido):
      // uma segunda linha pendente é reivindicada com token distinto.
      let portBIniciou = false;
      let liberarPortB!: () => void;
      const portB = async (_guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        portBIniciou = true;
        await new Promise<void>((resolve) => {
          liberarPortB = resolve;
        });
        return conferenciaSintetica(regras);
      };
      const chamadaB = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir: portB,
        agora: AGORA,
      });
      await esperarPor(() => portBIniciou);
      await esperarAte(
        async () =>
          (await linhasDoLote(db, lote.id)).filter((linha) => linha.estado === "EM_ANDAMENTO")
            .length === 2,
      );
      const reservas = await linhasDoLote(db, lote.id);
      const emAndamento = reservas.filter((linha) => linha.estado === "EM_ANDAMENTO");
      const linhaB = emAndamento.find((linha) => linha.id !== linhaA)!.id;
      const tokenB = emAndamento.find((linha) => linha.id === linhaB)!.dono!;

      // Cada linha pendente é reivindicada uma única vez, com tokens distintos e
      // geração monotônica, mesmo com o dono reutilizado pelo chamador.
      expect(new Set(emAndamento.map((linha) => linha.id)).size).toBe(2);
      expect(linhaB).not.toBe(linhaA);
      expect(tokenB).toMatch(/^worker:\d+$/);
      expect(tokenB).not.toBe(tokenA);
      expect(geracaoDoToken(tokenB)).toBeGreaterThan(geracaoDoToken(tokenA));
      expect(emAndamento.map((linha) => linha.id).sort()).toEqual([linhaA, linhaB].sort());
      expect(reservas.filter((linha) => linha.estado === "PENDENTE")).toHaveLength(2);

      // Libera os dois: cada worker conclui SÓ a sua linha, sem duplicar trabalho.
      liberarPortA();
      liberarPortB();
      await Promise.all([chamadaA, chamadaB]);
      const aposChamadas = await linhasDoLote(db, lote.id);
      expect(
        aposChamadas
          .filter((linha) => linha.estado === "PROCESSADO")
          .map((linha) => linha.id)
          .sort(),
      ).toEqual([linhaA, linhaB].sort());
      expect(await contar(db, "guides")).toBe(2);
      expect(await contar(db, "guide_revisions")).toBe(2);

      // A continuação esvazia o lote; nenhuma linha é processada duas vezes.
      const progresso = await api.continuarImportacao(db, {
        loteId: lote.id,
        conferir: portaSintetica(regras),
        agora: AGORA,
      });
      const finais = await linhasDoLote(db, lote.id);
      expect(finais.every((linha) => linha.estado === "PROCESSADO")).toBe(true);
      expect(new Set(finais.map((linha) => linha.id)).size).toBe(4);
      expect(finais.every((linha) => linha.guia_id !== null)).toBe(true);
      expect(new Set(finais.map((linha) => linha.guia_id)).size).toBe(4);
      expect(progresso.processadas).toBe(4);
      expect(await contar(db, "guides")).toBe(4);
      expect(await contar(db, "guide_revisions")).toBe(4);
      const lido = (await api.lerProgresso(db, lote.id))!;
      expect(lido.status).toBe("CONCLUIDO");
    },
    30000,
  );

  it(
    "token expirado não sobrepõe REAPROVEITADO nem FALHOU do dono vigente",
    async () => {
      const api = exigirApi();
      const db = await criarBanco();
      const regras = carregarRegrasSinteticas();
      const idX = "G-2608-1001";
      const idY = "G-2608-1002";
      const csvDuas = `${[CABECALHO, linhaSintetica(1), linhaSintetica(2)].join("\n")}\n`;

      const lote = await api.iniciarImportacao(db, {
        csv: csvDuas,
        arquivoNome: "duas-linhas.csv",
        idempotencyKey: "K-fence-terminal",
        regras,
        conferir: portaSintetica(regras),
        agora: AGORA,
      });
      expect(await contar(db, "import_lines")).toBe(2);

      // O conteúdo de X já está no histórico: processar X vira REAPROVEITADO.
      const preRegistro = await registrarGuia(db, {
        guia: normalizarGuia(parseGuiasCsv(csvDuas).guias[0]!),
        conferencia: conferenciaSintetica(regras),
        idempotencyKey: "K-pre-X",
        regras,
        agora: AGORA,
      });
      expect(preRegistro.tipo).toBe("criada");
      expect(await contar(db, "guides")).toBe(1);
      expect(await contar(db, "guide_revisions")).toBe(1);

      // Dono A: segura na linha X e falha na linha Y.
      let portAXIniciou = false;
      let portAYInvocada = false;
      let liberarPortAX!: () => void;
      const portA = async (guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        if (guia.id === idX) {
          portAXIniciou = true;
          await new Promise<void>((resolve) => {
            liberarPortAX = resolve;
          });
          return conferenciaSintetica(regras);
        }
        portAYInvocada = true;
        throw new Error(`falha_velha:${guia.id}`);
      };
      const chamadaA = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir: portA,
        agora: AGORA,
      });
      await esperarPor(() => portAXIniciou);
      await esperarAte(async () =>
        (await linhasDoLote(db, lote.id)).every((linha) => linha.estado === "EM_ANDAMENTO"),
      );
      const emAndamentoA = await linhasDoLote(db, lote.id);
      const tokenA = emAndamentoA[0]!.dono!;
      expect(tokenA).toMatch(/^worker:\d+$/);
      expect(emAndamentoA.every((linha) => linha.dono === tokenA)).toBe(true);

      // Dono B com lease expirado: X reaproveita (terminal REAPROVEITADO) e Y
      // falha com marcador NOVO (terminal FALHOU).
      const portB = async (guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        if (guia.id === idX) {
          return conferenciaSintetica(regras);
        }
        throw new Error(`falha_nova:${guia.id}`);
      };
      await api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir: portB,
        agora: SEIS_MINUTOS_DEPOIS,
      });

      const aposB = await linhasDoLote(db, lote.id);
      const linhaXaposB = aposB.find((linha) => linha.linha_original.includes(idX))!;
      const linhaYaposB = aposB.find((linha) => linha.linha_original.includes(idY))!;
      expect(linhaXaposB.id).not.toBe(linhaYaposB.id);
      expect(linhaXaposB.estado).toBe("REAPROVEITADO");
      expect(linhaXaposB.atualizado_em).toBe(SEIS_MINUTOS_DEPOIS);
      expect(linhaYaposB.estado).toBe("FALHOU");
      expect(linhaYaposB.motivo ?? "").toContain("falha_nova");
      expect(linhaYaposB.motivo ?? "").not.toContain("falha_velha");

      // Dono A (token expirado) retoma: X reaproveitada e Y com falha velha são
      // transições terminais guardadas que não podem sobrepor o vencedor.
      liberarPortAX();
      await chamadaA;
      // O dono expirado de fato executou os DOIS ramos: tentou reaproveitar X e
      // tentou persistir FALHOU por Y com o marcador velho. Sem isto, uma
      // implementação que abandonasse a linha Y passaria sem exercitar a
      // transição terminal guardada.
      expect(portAXIniciou).toBe(true);
      expect(portAYInvocada).toBe(true);
      const aposA = await linhasDoLote(db, lote.id);
      const linhaXaposA = aposA.find((linha) => linha.linha_original.includes(idX))!;
      const linhaYaposA = aposA.find((linha) => linha.linha_original.includes(idY))!;
      expect(linhaXaposA.estado).toBe("REAPROVEITADO");
      expect(linhaXaposA.atualizado_em).toBe(SEIS_MINUTOS_DEPOIS);
      expect(linhaYaposA.estado).toBe("FALHOU");
      expect(linhaYaposA.motivo ?? "").toContain("falha_nova");
      expect(linhaYaposA.motivo ?? "").not.toContain("falha_velha");
      expect(await contar(db, "guides")).toBe(1);
      expect(await contar(db, "guide_revisions")).toBe(1);
      expect(await contar(db, "import_lines")).toBe(2);
    },
    30000,
  );

  it(
    "lease de cinco minutos não é liberado antes de expirar",
    async () => {
      const api = exigirApi();
      const db = await criarBanco();
      const regras = carregarRegrasSinteticas();
      const lote = await api.iniciarImportacao(db, {
        csv: `${[CABECALHO, linhaSintetica(1)].join("\n")}\n`,
        arquivoNome: "uma-linha.csv",
        idempotencyKey: "K-lease",
        regras,
        conferir: portaSintetica(regras),
        agora: AGORA,
      });

      let invocacoes = 0;
      let liberar!: () => void;
      const conferirDoTitular = async (_guia: GuiaNormalizada): Promise<ConferenciaPersistivel> => {
        invocacoes += 1;
        await new Promise<void>((resolve) => {
          liberar = resolve;
        });
        return conferenciaSintetica(regras);
      };

      const titular = api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker",
        conferir: conferirDoTitular,
        agora: AGORA,
      });
      await esperarPor(() => invocacoes >= 1);
      const antes = await linhasDoLote(db, lote.id);
      const token = antes[0]!.dono!;

      // Um minuto depois o lease de cinco ainda vale: a linha NÃO é liberada
      // nem reivindicada por outro chamador.
      let chamadasIntrusas = 0;
      const portIntrusa = async (): Promise<ConferenciaPersistivel> => {
        chamadasIntrusas += 1;
        return conferenciaSintetica(regras);
      };
      const progressoIntruso = await api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "intruso",
        conferir: portIntrusa,
        agora: UM_MINUTO_DEPOIS,
      });
      expect(chamadasIntrusas).toBe(0);
      expect(progressoIntruso.pendentes).toBe(0);
      expect(progressoIntruso.emAndamento).toBe(1);
      expect(progressoIntruso).toEqual(await contarLinhasPorEstado(db, lote.id));

      const apos = await linhasDoLote(db, lote.id);
      expect(apos[0]!.dono).toBe(token);
      expect(apos[0]!.reservado_em).toBe(antes[0]!.reservado_em);

      // O titular original conclui normalmente.
      liberar();
      await titular;
      const finais = await linhasDoLote(db, lote.id);
      expect(finais[0]!.estado).toBe("PROCESSADO");
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// lt-idempotencia-reimportacao-corpus (#ac-3, #ac-5, #ac-7, #ac-8, #ac-9, #ac-11)
// ---------------------------------------------------------------------------

describe("lt-idempotencia-reimportacao-corpus: corpus oficial, idempotência e A→B", () => {
  it(
    "ordem direta e reversa convergem para o mesmo overlay determinístico",
    async () => {
      const api = exigirApi();
      const regras = carregarRegrasReais();
      const oraculo = carregarOraculo();
      const direta = await criarBanco();
      const reversa = await criarBanco();

      const resultadoDireto = await api.importarLote(direta, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-direta",
        regras,
        conferir: criarPortaCorpus(regras, oraculo),
        agora: AGORA,
      });
      const resultadoReverso = await api.importarLote(reversa, {
        csv: csvInvertido(csv),
        arquivoNome: "guias.csv",
        idempotencyKey: "K-reversa",
        regras,
        conferir: criarPortaCorpus(regras, oraculo),
        agora: AGORA,
      });

      expect(resultadoDireto.lote.status).toBe("CONCLUIDO");
      expect(resultadoDireto.progresso.processadas).toBe(80);
      expect(resultadoDireto.progresso.comFalha).toBe(0);
      expect(resultadoReverso.lote.status).toBe("CONCLUIDO");
      expect(resultadoReverso.progresso.processadas).toBe(80);

      await assertConvergenciaCorpus(direta);
      await assertConvergenciaCorpus(reversa);
    },
    120000,
  );

  it(
    "passe de duplicidade roda já no retorno de cada chunk",
    async () => {
      const api = exigirApi();
      const regras = carregarRegrasReais();
      const oraculo = carregarOraculo();
      const db = await criarBanco();
      const conferir = criarPortaCorpus(regras, oraculo);

      const lote = await api.iniciarImportacao(db, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-passe",
        regras,
        conferir,
        agora: AGORA,
        tamanhoChunk: 60,
      });

      // O primeiro chunk cobre 0027 (linha 27), 0057 (57) e 0059 (59): o par
      // 0027/0057 já está completo, então o overlay aparece antes do lote todo.
      const progresso = await api.processarProximoChunk(db, {
        loteId: lote.id,
        dono: "worker-passe",
        conferir,
        agora: AGORA,
      });
      expect(progresso.processadas).toBe(60);

      const estado0027 = await estadoAtual(db, "G-2608-0027");
      const estado0057 = await estadoAtual(db, "G-2608-0057");
      expect(estado0027.decisao).toBe("PENDENTE");
      expect(estado0027.codigos).toContain("duplicidade_grupo_candidato");
      expect(estado0057.decisao).toBe("PENDENTE");
      expect(estado0057.codigos).toContain("duplicidade_grupo_candidato");
      // 0059 ainda não tem seu par (0076 fica no próximo chunk): sem overlay.
      const estado0059 = await estadoAtual(db, "G-2608-0059");
      expect(estado0059.codigos).not.toContain("duplicidade_grupo_candidato");

      // A continuação processa o restante e converge para o mesmo estado final.
      await api.continuarImportacao(db, { loteId: lote.id, conferir, agora: AGORA });
      await assertConvergenciaCorpus(db);
    },
    120000,
  );

  it(
    "corrida com a mesma chave devolve um lote vencedor; replay não escreve e payload divergente erra",
    async () => {
      const api = exigirApi();
      const regras = carregarRegrasReais();
      const oraculo = carregarOraculo();
      const db = await criarBanco();
      const conferir = criarPortaCorpus(regras, oraculo);

      const resultados = await Promise.all([
        api.importarLote(db, {
          csv,
          arquivoNome: "guias.csv",
          idempotencyKey: "K-corrida",
          regras,
          conferir,
          agora: AGORA,
        }),
        api.importarLote(db, {
          csv,
          arquivoNome: "guias.csv",
          idempotencyKey: "K-corrida",
          regras,
          conferir,
          agora: AGORA,
        }),
      ]);

      // Um único lote vencedor e nenhuma linha duplicada.
      expect(resultados[0]!.lote.id).toBe(resultados[1]!.lote.id);
      expect(await contar(db, "imports")).toBe(1);
      expect(await contar(db, "import_lines")).toBe(80);
      expect(await contar(db, "guides")).toBe(80);

      // Replay idêntico com a mesma chave: nada é escrito.
      const antes = await contagens(db);
      const replay = await api.iniciarImportacao(db, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-corrida",
        regras,
        conferir,
        agora: UM_MINUTO_DEPOIS,
      });
      expect(replay.id).toBe(resultados[0]!.lote.id);
      expect(replay.status).toBe("CONCLUIDO");
      expect(await contagens(db)).toEqual(antes);

      // Payload divergente reutilizando a chave: erro explícito e zero escrita.
      await expect(
        api.iniciarImportacao(db, {
          csv: csv.replace("90.00", "91.00"),
          arquivoNome: "guias.csv",
          idempotencyKey: "K-corrida",
          regras,
          conferir,
          agora: UM_MINUTO_DEPOIS,
        }),
      ).rejects.toThrow();
      expect(await contagens(db)).toEqual(antes);
    },
    120000,
  );

  it(
    "reimportar o corpus com nova chave após A→B marca REAPROVEITADO sem ressuscitar A",
    async () => {
      const api = exigirApi();
      const regras = carregarRegrasReais();
      const oraculo = carregarOraculo();
      const db = await criarBanco();
      const conferir = criarPortaCorpus(regras, oraculo);

      const primeiro = await api.importarLote(db, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-original",
        regras,
        conferir,
        agora: AGORA,
      });
      expect(primeiro.lote.status).toBe("CONCLUIDO");

      // A→B: corrige a guia 0001 com uma nova revisão vigente.
      const primeiraLinha = parseGuiasCsv(csv).guias[0]!;
      const originalB: GuiaOriginal = {
        ...primeiraLinha.original,
        paciente: "P-9999",
        valor: "95.00",
        observacao_recepcao: "Correção humana aplicada sobre a guia original.",
      };
      const guiaB = normalizarGuia({
        numero: primeiraLinha.numero,
        original: originalB,
        linhaOriginal: primeiraLinha.linhaOriginal,
      });
      const correcao = await registrarGuia(db, {
        guia: guiaB,
        conferencia: conferenciaSintetica(regras),
        idempotencyKey: "K-correcao-0001",
        importId: primeiro.lote.id,
        regras,
        agora: UM_MINUTO_DEPOIS,
      });
      expect(correcao.tipo).toBe("criada");

      // Reimporta o arquivo original (conteúdo A de 0001) com uma NOVA chave.
      const segundo = await api.importarLote(db, {
        csv,
        arquivoNome: "guias.csv",
        idempotencyKey: "K-reimportacao",
        regras,
        conferir,
        agora: UM_MINUTO_DEPOIS,
      });
      expect(segundo.lote.status).toBe("CONCLUIDO");
      expect(segundo.progresso.reaproveitadas).toBe(80);
      expect(segundo.progresso.comFalha).toBe(0);

      const linhas = await linhasDoLote(db, segundo.lote.id);
      expect(linhas).toHaveLength(80);
      expect(linhas.every((linha) => linha.estado === "REAPROVEITADO")).toBe(true);

      // B permanece vigente e A não ressuscita: exatamente duas revisões.
      const guiaInterna = await db
        .prepare("SELECT id FROM guides WHERE id_guia = ?")
        .bind("G-2608-0001")
        .first<{ id: string }>();
      const revisoes = await db
        .prepare(
          "SELECT numero, vigente, entrada_normalizada_json FROM guide_revisions WHERE guide_id = ? ORDER BY numero ASC",
        )
        .bind(guiaInterna!.id)
        .all<{ numero: number; vigente: number; entrada_normalizada_json: string }>();
      expect(revisoes.results).toHaveLength(2);
      expect(revisoes.results.map((linha) => linha.vigente)).toEqual([0, 1]);
      const vigente = JSON.parse(revisoes.results[1]!.entrada_normalizada_json) as {
        paciente: string;
      };
      expect(vigente.paciente).toBe("P-9999");

      // 80 revisões originais + a correção B; nenhuma revisão nova do reimport.
      expect(await contar(db, "guide_revisions")).toBe(81);
      expect(await contar(db, "guides")).toBe(80);
    },
    120000,
  );
});
