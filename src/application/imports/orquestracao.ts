/**
 * Orquestração retomável da importação de guias.
 *
 * Fluxo indivisível de estado persistido: inicialização idempotente, reserva
 * atômica por chunk com token monotônico `dono:geracao`, fence por linha no
 * mesmo batch da escrita da guia, releitura de verificação e status derivado
 * das linhas. Nenhum estado de progresso vive em memória: o lote é retomável a
 * partir de `import_lines` a cada chamada (J12).
 */

import { normalizarGuia, parseGuiasCsv } from "../../domain";
import type { Catalogo, GuiaNormalizada, GuiaOriginal, ResultadoCsv } from "../../domain";
import { prepararPersistenciaConferencia, reavaliarDuplicidade } from "../guides";
import type {
  ConferenciaPersistivel,
  OpcoesPersistencia,
  ResultadoPreparo,
} from "../guides";
import {
  contarLinhasPorEstado,
  lerImportacao,
  mapearLinhaImportacao,
  traduzirConflitoUnicidade,
} from "../../storage";
import type {
  ContagemLinhasImportacao,
  EstadoLinhaImportacao,
  ImportacaoPersistida,
  LinhaImportacao,
  LinhaBanco,
} from "../../storage";
import { sha256Hex } from "../../shared/sha256";
import type {
  LoteImportacao,
  OpcoesContinuarImportacao,
  OpcoesFinalizarLote,
  OpcoesIniciarImportacao,
  OpcoesProcessarChunk,
  ProgressoImportacao,
  ResultadoImportacaoLote,
} from "./contratos";
import { serializar } from "./serializacao";
import {
  SQL_FINALIZAR_IMPORT,
  SQL_INCREMENTAR_GERACAO,
  SQL_INSERIR_CHUNK,
  SQL_INSERIR_IMPORT,
  SQL_INSERIR_LINHA,
  SQL_INSERIR_RULESET,
  SQL_LER_ESTADO_LINHA,
  SQL_LIBERAR_EXPIRADAS,
  SQL_LINHAS_REIVINDICADAS,
  SQL_PROCESSAR_CHUNK,
  SQL_REIVINDICAR,
  SQL_TRANSICAO_TERMINAL,
} from "./sql";

const TAMANHO_CHUNK_PADRAO = 25;
const LEASE_MS = 5 * 60 * 1000;
const MOTIVO_ID_INVALIDO = "id_guia_invalido";

interface LinhaInicial {
  id: string;
  numeroLinha: number;
  estado: EstadoLinhaImportacao;
  linhaOriginal: string;
  originalJson: string | null;
  motivo: string | null;
}

interface Reivindicacao {
  geracao: number;
  token: string;
  linhas: LinhaImportacao[];
}

function montarLote(
  importacao: ImportacaoPersistida,
  progresso: ContagemLinhasImportacao,
): LoteImportacao {
  return {
    id: importacao.id,
    idempotencyKey: importacao.idempotencyKey,
    arquivoHash: importacao.arquivoHash,
    regrasHash: importacao.regrasHash,
    status: importacao.status,
    tamanhoChunk: importacao.tamanhoChunk,
    linhasEncontradas: importacao.linhasEncontradas,
    progresso,
  };
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) {
    return erro.message;
  }
  return String(erro);
}

/**
 * Monta as linhas físicas do lote na ordem do arquivo. Guias aceitas ficam
 * `PENDENTE` com `original_json`; rejeições do parser ficam `FALHOU` com o
 * motivo. `numero_linha` preserva o número físico do parser (cabeçalho = 1,
 * primeira linha de dados = 2) e o id é derivado do lote + esse número, o que
 * mantém `(import_id, numero_linha)` único sem densificar a numeração.
 */
function montarLinhasIniciais(loteId: string, resultado: ResultadoCsv): LinhaInicial[] {
  interface Cru {
    numero: number;
    ordem: number;
    estado: EstadoLinhaImportacao;
    linhaOriginal: string;
    originalJson: string | null;
    motivo: string | null;
  }
  const cruas: Cru[] = [];
  let ordem = 0;
  for (const guia of resultado.guias) {
    cruas.push({
      numero: guia.numero,
      ordem: ordem++,
      estado: "PENDENTE",
      linhaOriginal: guia.linhaOriginal,
      originalJson: JSON.stringify(guia.original),
      motivo: null,
    });
  }
  for (const falha of resultado.falhas) {
    cruas.push({
      numero: falha.numero,
      ordem: ordem++,
      estado: "FALHOU",
      linhaOriginal: falha.linhaOriginal,
      originalJson: null,
      motivo: falha.motivo,
    });
  }
  cruas.sort((a, b) => a.numero - b.numero || a.ordem - b.ordem);
  return cruas.map((crua) => ({
    id: sha256Hex(`${loteId}\u0000${crua.numero}`),
    numeroLinha: crua.numero,
    estado: crua.estado,
    linhaOriginal: crua.linhaOriginal,
    originalJson: crua.originalJson,
    motivo: crua.motivo,
  }));
}

function ehReplayDeImportacao(erro: unknown): boolean {
  const conflito = traduzirConflitoUnicidade(erro);
  return (
    conflito.tipo === "unicidade" &&
    conflito.tabela === "imports" &&
    conflito.colunas.includes("idempotency_key")
  );
}

/** Replay: relê a chave e exige payload idêntico, sem qualquer escrita. */
async function responderReplay(
  db: D1Database,
  o: OpcoesIniciarImportacao,
  arquivoHash: string,
  tamanhoChunk: number,
): Promise<LoteImportacao> {
  const achado = await db
    .prepare("SELECT id FROM imports WHERE idempotency_key = ?")
    .bind(o.idempotencyKey)
    .first<{ id: string }>();
  if (achado === null || achado === undefined) {
    throw new Error(`replay sem lote existente para a chave ${o.idempotencyKey}`);
  }
  const importacao = await lerImportacao(db, String(achado.id));
  if (importacao === null) {
    throw new Error(`lote ${String(achado.id)} ausente durante o replay`);
  }
  if (
    importacao.arquivoHash !== arquivoHash ||
    importacao.regrasHash !== o.regras.hash ||
    importacao.tamanhoChunk !== tamanhoChunk
  ) {
    throw new Error(
      `idempotency_key ${o.idempotencyKey} reutilizada com payload divergente (arquivo/regras/tamanho_chunk)`,
    );
  }
  const progresso = await contarLinhasPorEstado(db, importacao.id);
  return montarLote(importacao, progresso);
}

/**
 * O `tamanhoChunk` é o `LIMIT` da reivindicação atômica: rejeitar valor não
 * inteiro/seguro ou `<= 0` antes de persistir impede `LIMIT 0`/`LIMIT -1`.
 */
function validarTamanhoChunk(tamanhoChunk: number): void {
  if (!Number.isSafeInteger(tamanhoChunk) || tamanhoChunk <= 0) {
    throw new TypeError(
      `tamanhoChunk deve ser um inteiro positivo seguro; recebido ${String(tamanhoChunk)}`,
    );
  }
}

/**
 * Inicializa o lote: registra o ruleset por hash, persiste TODA linha física e
 * insere `imports` + `import_lines` num único batch atômico. Somente a violação
 * de unicidade de `imports.idempotency_key` é tratada como replay. O retorno
 * distingue a criação nova (`replay: false`) do replay idempotente
 * (`replay: true`), que não executa nenhuma escrita nem drenagem.
 */
async function iniciarImportacaoInterna(
  db: D1Database,
  o: OpcoesIniciarImportacao,
): Promise<{ lote: LoteImportacao; replay: boolean }> {
  const tamanhoChunk = o.tamanhoChunk ?? TAMANHO_CHUNK_PADRAO;
  validarTamanhoChunk(tamanhoChunk);
  const arquivoHash = sha256Hex(o.csv);
  const regrasHash = o.regras.hash;
  const loteId = sha256Hex(`lote\u0000${o.idempotencyKey}`);
  const linhas = montarLinhasIniciais(loteId, parseGuiasCsv(o.csv));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(SQL_INSERIR_RULESET)
      .bind(
        sha256Hex(`ruleset\u0000${regrasHash}`),
        o.regras.versao,
        regrasHash,
        JSON.stringify(o.regras),
        o.agora,
        regrasHash,
      ),
    db
      .prepare(SQL_INSERIR_IMPORT)
      .bind(
        loteId,
        o.idempotencyKey,
        o.arquivoNome,
        arquivoHash,
        o.regras.regrasVersao,
        regrasHash,
        "PROCESSANDO",
        tamanhoChunk,
        linhas.length,
        o.agora,
        o.agora,
        null,
      ),
    ...linhas.map((linha) =>
      db
        .prepare(SQL_INSERIR_LINHA)
        .bind(
          linha.id,
          loteId,
          linha.numeroLinha,
          linha.estado,
          linha.linhaOriginal,
          linha.originalJson,
          linha.motivo,
          o.agora,
        ),
    ),
  ];

  try {
    await serializar(() => db.batch(statements));
  } catch (erro) {
    if (ehReplayDeImportacao(erro)) {
      const lote = await serializar(() =>
        responderReplay(db, o, arquivoHash, tamanhoChunk),
      );
      return { lote, replay: true };
    }
    throw erro;
  }

  await finalizarLoteSeTerminal(db, { loteId, agora: o.agora });
  await serializar(() => reavaliarDuplicidade(db, { agora: o.agora }));

  const importacao = await lerImportacao(db, loteId);
  if (importacao === null) {
    throw new Error(`lote ${loteId} ausente após a inicialização`);
  }
  const progresso = await contarLinhasPorEstado(db, loteId);
  return { lote: montarLote(importacao, progresso), replay: false };
}

/**
 * Inicializa o lote e devolve apenas a visão pública. Em replay idempotente o
 * lote durável existente é devolvido sem qualquer escrita.
 */
export async function iniciarImportacao(
  db: D1Database,
  o: OpcoesIniciarImportacao,
): Promise<LoteImportacao> {
  return (await iniciarImportacaoInterna(db, o)).lote;
}

/** Recarrega o catálogo a partir do ruleset persistido (J12, sem memória). */
async function carregarRegrasDoLote(db: D1Database, loteId: string): Promise<Catalogo> {
  const importacao = await lerImportacao(db, loteId);
  if (importacao === null) {
    throw new Error(`lote inexistente: ${loteId}`);
  }
  const linha = await db
    .prepare("SELECT hash, conteudo_json FROM rulesets WHERE hash = ?")
    .bind(importacao.regrasHash)
    .first<{ hash: string; conteudo_json: string }>();
  if (linha === null || linha === undefined) {
    throw new Error(`ruleset ausente para o hash ${importacao.regrasHash}`);
  }
  let dados: unknown;
  try {
    dados = JSON.parse(String(linha.conteudo_json));
  } catch {
    throw new Error(`ruleset ${importacao.regrasHash} com conteudo_json invalido`);
  }
  // O ruleset guarda o snapshot do catálogo já validado (com `hash` e
  // `regrasVersao`); reler o mesmo objeto preserva o digest registrado, ao
  // contrário de rederivar um hash de uma entrada bruta reconstruída.
  const catalogo = dados as Catalogo | null;
  if (
    catalogo === null ||
    typeof catalogo !== "object" ||
    catalogo.hash !== importacao.regrasHash ||
    typeof catalogo.regrasVersao !== "string"
  ) {
    throw new Error(`ruleset ${importacao.regrasHash} inconsistente`);
  }
  return catalogo;
}

interface Terminal {
  estado: EstadoLinhaImportacao;
  guiaId: string | null;
  revisaoId: string | null;
  motivo: string | null;
}

function mapearTerminal(preparo: ResultadoPreparo): Terminal {
  switch (preparo.tipo) {
    case "criada":
      return {
        estado: "PROCESSADO",
        guiaId: preparo.revisao?.guiaId ?? null,
        revisaoId: preparo.revisao?.id ?? null,
        motivo: null,
      };
    case "reaproveitada":
      return {
        estado: "REAPROVEITADO",
        guiaId: preparo.revisao?.guiaId ?? null,
        revisaoId: preparo.revisao?.id ?? null,
        motivo: null,
      };
    default:
      return {
        estado: "FALHOU",
        guiaId: null,
        revisaoId: null,
        motivo:
          "conflito_idempotencia: conteudo divergente para a mesma chave de idempotencia",
      };
  }
}

type ResultadoExecucaoLinha = "aplicado" | "noop" | "unicidade";

const ESTADOS_TERMINAIS: ReadonlySet<EstadoLinhaImportacao> = new Set<EstadoLinhaImportacao>([
  "PROCESSADO",
  "REAPROVEITADO",
  "FALHOU",
]);

/**
 * Releitura de verificação (J18): confirma no próprio banco que a linha alcançou
 * um estado terminal. Uma tentativa cujo guarda perdeu a posse não é contada
 * como aplicada e jamais sobrescreve o vencedor.
 */
async function confirmarTerminal(db: D1Database, linhaId: string): Promise<boolean> {
  const linha = await db
    .prepare(SQL_LER_ESTADO_LINHA)
    .bind(linhaId)
    .first<{ estado: string }>();
  return (
    linha !== null &&
    linha !== undefined &&
    ESTADOS_TERMINAIS.has(String(linha.estado) as EstadoLinhaImportacao)
  );
}

/** Um único batch com os statements preparados + a transição terminal guardada. */
async function executarBatchDaLinha(
  db: D1Database,
  preparo: ResultadoPreparo,
  linhaId: string,
  token: string,
  agora: string,
): Promise<ResultadoExecucaoLinha> {
  const terminal = mapearTerminal(preparo);
  const statements: D1PreparedStatement[] = [
    ...preparo.statements,
    db
      .prepare(SQL_TRANSICAO_TERMINAL)
      .bind(
        terminal.estado,
        terminal.guiaId,
        terminal.revisaoId,
        terminal.motivo,
        agora,
        linhaId,
        token,
      ),
  ];
  try {
    const resultados = await db.batch(statements);
    const changes = resultados[resultados.length - 1]?.meta.changes ?? 0;
    if (changes <= 0) {
      return "noop";
    }
    return (await confirmarTerminal(db, linhaId)) ? "aplicado" : "noop";
  } catch (erro) {
    if (traduzirConflitoUnicidade(erro).tipo === "unicidade") {
      return "unicidade";
    }
    throw erro;
  }
}

/** Prepara e aplica a escrita da guia + transição terminal no mesmo batch. */
async function persistirLinha(
  db: D1Database,
  loteId: string,
  linha: LinhaImportacao,
  token: string,
  guia: GuiaNormalizada,
  conferencia: ConferenciaPersistivel,
  regras: Catalogo,
  agora: string,
): Promise<void> {
  const opcoes: OpcoesPersistencia = {
    guia,
    conferencia,
    idempotencyKey: `${loteId}\u0000${linha.id}`,
    importId: loteId,
    regras,
    agora,
    guarda: { linhaId: linha.id, token },
  };

  let preparo = await prepararPersistenciaConferencia(db, opcoes);
  let resultado = await executarBatchDaLinha(db, preparo, linha.id, token, agora);
  if (resultado === "unicidade") {
    preparo = await prepararPersistenciaConferencia(db, opcoes);
    resultado = await executarBatchDaLinha(db, preparo, linha.id, token, agora);
    if (resultado === "unicidade") {
      throw new Error(`conflito de unicidade persistente na linha ${linha.id}`);
    }
  }
  // `resultado === "noop"` significa que a posse foi perdida: o batch inteiro é
  // no-op e nenhuma transição terminal pode sobrescrever o vencedor.
}

/**
 * Aplica uma transição terminal guardada isolada (exceção da porta ou dado
 * inválido da linha) e confirma por releitura que a posse vigente produziu o
 * estado terminal; se não confirmar, a tentativa é descartada sem qualquer
 * escrita sobre o vencedor.
 */
async function aplicarFalhaDaLinha(
  db: D1Database,
  linhaId: string,
  token: string,
  motivo: string,
  agora: string,
): Promise<boolean> {
  await db.batch([
    db
      .prepare(SQL_TRANSICAO_TERMINAL)
      .bind("FALHOU", null, null, motivo, agora, linhaId, token),
  ]);
  return confirmarTerminal(db, linhaId);
}

function reconstruirGuia(linha: LinhaImportacao): GuiaNormalizada {
  if (linha.originalJson === null) {
    throw new Error(`linha ${linha.id} sem original_json`);
  }
  const original = JSON.parse(linha.originalJson) as GuiaOriginal;
  return normalizarGuia({
    numero: linha.numeroLinha,
    original,
    linhaOriginal: linha.linhaOriginal,
  });
}

/** Reivindica até `tamanhoChunk` linhas pendentes numa seção serializada. */
async function reivindicar(
  db: D1Database,
  o: OpcoesProcessarChunk,
): Promise<Reivindicacao> {
  const lote = await lerImportacao(db, o.loteId);
  if (lote === null) {
    throw new Error(`lote inexistente: ${o.loteId}`);
  }
  const cutoff = new Date(Date.parse(o.agora) - LEASE_MS).toISOString();
  await db
    .prepare(SQL_LIBERAR_EXPIRADAS)
    .bind(o.agora, o.loteId, cutoff)
    .run();

  const geracaoLinha = await db
    .prepare(SQL_INCREMENTAR_GERACAO)
    .first<{ versao: number }>();
  const geracao = Number(geracaoLinha?.versao ?? 0);
  const token = `${o.dono}:${geracao}`;

  await db
    .prepare(SQL_REIVINDICAR)
    .bind(token, o.agora, o.agora, o.loteId, lote.tamanhoChunk)
    .run();

  const resultado = await db
    .prepare(SQL_LINHAS_REIVINDICADAS)
    .bind(o.loteId, token)
    .all<LinhaBanco>();
  const linhas = resultado.results.map(mapearLinhaImportacao);

  if (linhas.length > 0) {
    const primeira = Math.min(...linhas.map((linha) => linha.numeroLinha));
    const ultima = Math.max(...linhas.map((linha) => linha.numeroLinha));
    await db
      .prepare(SQL_INSERIR_CHUNK)
      .bind(
        sha256Hex(`chunk\u0000${o.loteId}\u0000${geracao}`),
        o.loteId,
        geracao,
        primeira,
        ultima,
        token,
        o.agora,
      )
      .run();
  }
  return { geracao, token, linhas };
}

/**
 * Processa um chunk: libera apenas lease expirado, reivindica atomicamente com
 * token monotônico, chama a porta fora do batch e aplica a escrita da guia com
 * a transição terminal guardada.
 */
export async function processarProximoChunk(
  db: D1Database,
  o: OpcoesProcessarChunk,
): Promise<ProgressoImportacao> {
  const reivindicacao = await serializar(() => reivindicar(db, o));

  if (reivindicacao.linhas.length > 0) {
    const regras = await serializar(() => carregarRegrasDoLote(db, o.loteId));
    for (const linha of reivindicacao.linhas) {
      const guia = reconstruirGuia(linha);
      // Dado inválido da própria linha (id vazio/não textual) é falha durável
      // daquela linha, não erro de infraestrutura: transiciona FALHOU guardado e
      // segue com o restante do chunk, sem invocar a porta nem abortá-lo.
      if (typeof guia.id !== "string" || guia.id.trim() === "") {
        await serializar(() =>
          aplicarFalhaDaLinha(
            db,
            linha.id,
            reivindicacao.token,
            MOTIVO_ID_INVALIDO,
            o.agora,
          ),
        );
        continue;
      }
      let conferencia: ConferenciaPersistivel;
      try {
        conferencia = await o.conferir(guia);
      } catch (erro) {
        await serializar(() =>
          aplicarFalhaDaLinha(
            db,
            linha.id,
            reivindicacao.token,
            mensagemDeErro(erro),
            o.agora,
          ),
        );
        continue;
      }
      await serializar(() =>
        persistirLinha(
          db,
          o.loteId,
          linha,
          reivindicacao.token,
          guia,
          conferencia,
          regras,
          o.agora,
        ),
      );
    }
    await serializar(() =>
      db
        .prepare(SQL_PROCESSAR_CHUNK)
        .bind(o.agora, sha256Hex(`chunk\u0000${o.loteId}\u0000${reivindicacao.geracao}`))
        .run()
        .then(() => undefined),
    );
  }

  const finalizado = await finalizarLoteSeTerminal(db, {
    loteId: o.loteId,
    agora: o.agora,
  });
  await serializar(() => reavaliarDuplicidade(db, { agora: o.agora }));
  return finalizado.progresso;
}

/**
 * Drena o lote com um único worker até não restar linha `PENDENTE` (ainda que
 * outra linha esteja `EM_ANDAMENTO` com outro dono) e finaliza o status.
 */
export async function continuarImportacao(
  db: D1Database,
  o: OpcoesContinuarImportacao,
): Promise<ProgressoImportacao> {
  let progresso = await processarProximoChunk(db, {
    loteId: o.loteId,
    dono: "continuacao",
    conferir: o.conferir,
    agora: o.agora,
  });
  while (progresso.pendentes > 0) {
    progresso = await processarProximoChunk(db, {
      loteId: o.loteId,
      dono: "continuacao",
      conferir: o.conferir,
      agora: o.agora,
    });
  }
  return progresso;
}

/**
 * Inicializa e drena o lote; devolve o lote final e o progresso derivado. Um
 * replay idempotente (mesma chave/payload) devolve o lote durável sem chamar
 * `continuarImportacao`: nenhuma geração global é incrementada nem `imports` é
 * reescrito. `continuarImportacao` segue sendo a API explícita de retomada.
 */
export async function importarLote(
  db: D1Database,
  o: OpcoesIniciarImportacao,
): Promise<ResultadoImportacaoLote> {
  const { lote, replay } = await iniciarImportacaoInterna(db, o);
  if (replay) {
    return { lote, progresso: lote.progresso };
  }
  const progresso = await continuarImportacao(db, {
    loteId: lote.id,
    conferir: o.conferir,
    agora: o.agora,
    tamanhoChunk: o.tamanhoChunk,
  });
  const final = (await lerProgresso(db, lote.id)) ?? lote;
  return { lote: final, progresso };
}

/** Metadados do lote + progresso derivado, ou `null` para lote desconhecido. */
export async function lerProgresso(
  db: D1Database,
  loteId: string,
): Promise<LoteImportacao | null> {
  const importacao = await lerImportacao(db, loteId);
  if (importacao === null) {
    return null;
  }
  const progresso = await contarLinhasPorEstado(db, loteId);
  return montarLote(importacao, progresso);
}

/**
 * Deriva e persiste o status do lote a partir dos estados das linhas. A
 * derivação e a escrita acontecem numa única instrução SQL (subqueries `CASE`
 * sobre `import_lines`), de modo que uma contagem obsoleta não pode sobrescrever
 * um status terminal gravado por outro worker; o valor retornado é relido.
 */
export async function finalizarLoteSeTerminal(
  db: D1Database,
  o: OpcoesFinalizarLote,
): Promise<LoteImportacao> {
  return serializar(async () => {
    const existente = await lerImportacao(db, o.loteId);
    if (existente === null) {
      throw new Error(`lote inexistente: ${o.loteId}`);
    }
    await db
      .prepare(SQL_FINALIZAR_IMPORT)
      .bind(o.agora, o.agora, o.loteId)
      .run();
    const importacao = await lerImportacao(db, o.loteId);
    if (importacao === null) {
      throw new Error(`lote ${o.loteId} ausente após a finalização`);
    }
    const progresso = await contarLinhasPorEstado(db, o.loteId);
    return montarLote(importacao, progresso);
  });
}
