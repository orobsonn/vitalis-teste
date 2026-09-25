import rawCatalog from "../../docs/fontes/regras_convenio.json";
import { carregarCatalogo, consultarRegra, COLUNAS_GUIA, normalizarGuia, parseDataCivil } from "../domain";
import type { ColunaGuia, GuiaOriginal, GuiaNormalizada } from "../domain";
import { conferirGuia, criarAdaptadorCacheSemantico, criarInterpretadorWorkersAi,
  MODELO_OBSERVACAO, montarChaveCacheSemantica, versaoEfetivaDoPrompt, criarRegistradorRedigido,
  PROMPT_HASH, validarExtracao, campoTemTamanhoDeAbuso, LIMITE_OBSERVACAO, LIMITE_CONTEXTO,
  LIMITE_VALOR_CACHE_BYTES, TIMEOUT_PADRAO_MS } from "../semantic";
import type { SinaisObservacao } from "../semantic";
import { conferirGuiaAdHoc, registrarGuia } from "./guides";
import type { ConferenciaPersistivel } from "./guides";
import { sha256Hex } from "../shared/sha256";
import { PublicError } from "./errors";
import { guideDetail } from "./views";
import { withOperationalLock } from "./lock";
import { allowRateLimit } from "../auth/limits";

const loadedCatalog = carregarCatalogo(rawCatalog);
if (!loadedCatalog.ok) throw new Error("Catálogo inválido na compilação.");
export const catalogo = loadedCatalog.catalogo;

export interface GuideInput {
  guia: Partial<Record<ColunaGuia, string | null>>;
  referencia_temporal?: string;
}

export function originalFromInput(input: unknown): GuiaOriginal {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PublicError(422, "Informe os campos da guia.");
  }
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(k => !COLUNAS_GUIA.includes(k as ColunaGuia))) {
    throw new PublicError(422, "A guia contém campos desconhecidos.");
  }
  const result = {} as GuiaOriginal;
  for (const key of COLUNAS_GUIA) {
    const value = data[key];
    if (value != null && typeof value !== "string") throw new PublicError(422, `O campo ${key} deve ser texto.`);
    if (typeof value === "string" && value.length > (key === "observacao_recepcao" ? 1000 : 300)) {
      throw new PublicError(422, `O campo ${key} excede o tamanho permitido.`);
    }
    result[key] = typeof value === "string" ? value : "";
  }
  return result;
}

/** Saved audit data is immutable; KV expiration must not change its interpretation. */
async function readPersistedExtraction(db: D1Database, guia: GuiaNormalizada): Promise<SinaisObservacao | null> {
  const entry = { observacao_recepcao: guia.observacaoRecepcao, convenio: guia.convenio,
    procedimento_codigo: guia.procedimentoCodigo };
  if (!entry.observacao_recepcao.trim() || Object.values(entry).some(campoTemTamanhoDeAbuso) ||
    entry.observacao_recepcao.trim().length > LIMITE_OBSERVACAO ||
    entry.convenio.trim().length > LIMITE_CONTEXTO || entry.procedimento_codigo.trim().length > LIMITE_CONTEXTO) return null;
  const context = { modelo: MODELO_OBSERVACAO, promptVersao: versaoEfetivaDoPrompt(), promptHash: PROMPT_HASH };
  const identity = montarChaveCacheSemantica(entry, context).chave;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const row = await Promise.race([
      db.prepare("SELECT sinais_json,situacao_json,ambiguidades_json FROM semantic_extractions WHERE observacao_hash=? AND modelo=? AND prompt_versao=?")
        .bind(identity, context.modelo, context.promptVersao)
        .first<{ sinais_json: string; situacao_json: string; ambiguidades_json: string }>(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Persistent extraction timeout")), TIMEOUT_PADRAO_MS); }),
    ]);
    if (!row) return null;
    const raw = `{"sinais":${row.sinais_json},"situacao":${row.situacao_json},"ambiguidades":${row.ambiguidades_json}}`;
    if (new TextEncoder().encode(raw).byteLength > LIMITE_VALOR_CACHE_BYTES) throw new Error("Invalid persistent extraction size");
    const validated = validarExtracao({ sinais: JSON.parse(row.sinais_json),
      situacao: JSON.parse(row.situacao_json), ambiguidades: JSON.parse(row.ambiguidades_json) }, entry.observacao_recepcao);
    if (!validated.ok) throw new Error("Invalid persistent extraction");
    return validated.sinais;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createConference(env: Env, userId = "demo") {
  const baseCache = criarAdaptadorCacheSemantico(env.CACHE_SEMANTICO);
  const registrador = criarRegistradorRedigido(evento => console.log(JSON.stringify(evento)));
  const interpreter = criarInterpretadorWorkersAi({
    run: async (_model, input) => {
      const budget = await allowRateLimit(env.DB, `ai:daily:${userId}`, 1000, 86400);
      if (!budget.allowed) throw new PublicError(429, "Limite diário de interpretação atingido.");
      return env.AI.run(MODELO_OBSERVACAO, input);
    },
  });
  return async (guia: GuiaNormalizada, reference?: string): Promise<ConferenciaPersistivel> => {
    const parsedReference = reference === undefined ? undefined : parseDataCivil(reference);
    if (reference !== undefined && !parsedReference) throw new PublicError(422, "Referência temporal inválida. Use AAAA-MM-DD.");
    let persisted: SinaisObservacao | null;
    try {
      // This bounded read precedes the best-effort cache: its errors must never become cache misses.
      persisted = await readPersistedExtraction(env.DB, guia);
    } catch {
      return { resultado: await conferirGuia(guia, catalogo, {
        interpretador: null, cache: null, referenciaTemporal: parsedReference ?? undefined, registrador,
      }), extracao: null };
    }
    // Capture the validated extraction delivered through the cache adapter, without trusting raw model output.
    const capture: { signals: SinaisObservacao | null; identity: string | null } = { signals: null, identity: null };
    const resultado = await conferirGuia(guia, catalogo, {
      interpretador: interpreter, referenciaTemporal: parsedReference ?? undefined, registrador,
      // Real model calls exceed 5 s; 8 s keeps three rows with two attempts below 48 s.
      timeoutMs: 8_000,
      cache: {
        ler: async (entry, context) => {
          capture.identity = montarChaveCacheSemantica(entry, context).chave;
          const signals = persisted ?? await baseCache.ler(entry, context); capture.signals = signals; return signals;
        },
        gravar: async (entry, context, signals) => {
          capture.identity = montarChaveCacheSemantica(entry, context).chave;
          capture.signals = signals; await baseCache.gravar(entry, context, signals);
        },
      },
    });
    const signals = capture.signals;
    return { resultado, extracao: resultado.checagem_textual === "completa" && signals && capture.identity ? {
      // The persisted extraction has the same identity as the validated cache:
      // text, agreement, procedure, model and effective prompt all participate.
      observacaoHash: capture.identity, modelo: MODELO_OBSERVACAO,
      promptVersao: versaoEfetivaDoPrompt(), sinais: signals.sinais,
      situacao: signals.situacao, ambiguidades: signals.ambiguidades,
    } : null };
  };
}

async function ensureManualImport(db: D1Database, now: string): Promise<string> {
  const id = `manual:${catalogo.hash}`;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO rulesets(id,versao,hash,conteudo_json,criado_em) VALUES(?,?,?,?,?)")
      .bind(sha256Hex(`ruleset\u0000${catalogo.hash}`), catalogo.versao, catalogo.hash, JSON.stringify(catalogo), now),
    db.prepare(`INSERT OR IGNORE INTO imports(id,idempotency_key,arquivo_nome,arquivo_hash,regras_versao,
      regras_hash,status,tamanho_chunk,linhas_encontradas,iniciado_em,atualizado_em,concluido_em)
      VALUES(?,?,?,?,?,?,'CONCLUIDO',3,0,?,?,?)`)
      .bind(id, id, "Cadastro manual", id, catalogo.regrasVersao, catalogo.hash, now, now, now),
  ]);
  return id;
}

export function createVitalisHandlers({ env, actor }: { env: Env; actor: { userId: string } }) {
  const conferir = createConference(env, actor.userId);
  return {
    consultarRegra: (input: { convenio: string; procedimento_codigo: string }) => consultarRegra(input, catalogo),
    verificarGuia: async (input: GuideInput) => {
      const guia = normalizarGuia({ numero: 1, original: originalFromInput(input.guia), linhaOriginal: "" });
      const conferencia = await conferir(guia, input.referencia_temporal);
      const overlay = await conferirGuiaAdHoc(env.DB, { guia, conferencia, regras: catalogo, agora: new Date().toISOString() });
      return { ...conferencia.resultado, ...overlay,
        orientacoes: [...new Set([...conferencia.resultado.orientacoes, ...overlay.motivos.map(m => m.orientacao)])],
        persistida: false };
    },
    registrarGuia: async (input: GuideInput & { idempotency_key: string }) => {
      const guia = normalizarGuia({ numero: 1, original: originalFromInput(input.guia), linhaOriginal: "" });
      if (!guia.id.trim()) throw new PublicError(422, "Informe o identificador da guia para registrar.");
      if (typeof input.idempotency_key !== "string" || !input.idempotency_key.trim() || input.idempotency_key.length > 256) {
        throw new PublicError(422, "Informe uma chave de idempotência válida.");
      }
      return withOperationalLock(env.DB, async () => {
        const now = new Date().toISOString();
        const conferencia = await conferir(guia, input.referencia_temporal);
        const importId = await ensureManualImport(env.DB, now);
        const saved = await registrarGuia(env.DB, { guia, conferencia, importId, regras: catalogo,
          agora: now, idempotencyKey: input.idempotency_key });
        if (saved.tipo === "conflito_idempotencia") throw new PublicError(409, "Esta chave já foi usada com dados diferentes. Gere uma nova chave para a correção.");
        const detail = await guideDetail(env.DB, guia.id);
        if (!detail) throw new PublicError(503, "Não foi possível ler a guia salva. Consulte a lista antes de repetir.");
        return { tipo: saved.tipo, revisaoId: saved.revisao?.id, idGuia: guia.id,
          id: detail.guia.id, guia: detail.guia, resultado: detail.guia.resultado, persistida: true,
          revisaoReaproveitadaVigente: saved.revisao?.vigente === 1 };
      });
    },
  };
}
