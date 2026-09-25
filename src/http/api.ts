import { Hono } from "hono";
import { z } from "zod";
import { catalogo, createConference, createVitalisHandlers } from "../application/runtime";
import { guideDetail, listGuides } from "../application/views";
import { PublicError } from "../application/errors";
import { withOperationalLock } from "../application/lock";
import { iniciarImportacao, lerProgresso, processarProximoChunk } from "../application/imports";
import { lerLinhasDoLote } from "../storage";
import { relatorioEstoque, relatorioAtividade } from "../reports";
import { dataParaIso, parseDataCivil } from "../domain";
import { sha256Hex } from "../shared/sha256";
import { reconferirGuia } from "../application/guides/reconferencia";

const importSchema = z.object({ csv: z.string().min(1).max(60_000),
  arquivo_nome: z.string().max(200).optional(), idempotency_key: z.string().min(1).max(256).optional() }).strict();
const guideSchema = z.object({ guia: z.record(z.string(), z.string().max(1000).nullable()),
  referencia_temporal: z.string().optional(), idempotency_key: z.string().min(1).max(256) }).strict();

export function createApiRoutes(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  const handlers = createVitalisHandlers({ env, actor: { userId: "demo" } });
  const conferir = createConference(env);

  app.get("/catalogo", c => c.json(catalogo));
  app.get("/regras", c => c.json(handlers.consultarRegra({ convenio: c.req.query("convenio") ?? "",
    procedimento_codigo: c.req.query("procedimento_codigo") ?? "" })));
  app.get("/dashboard", async c => {
    const deTexto = c.req.query("de"); const ateTexto = c.req.query("ate");
    const deCivil = deTexto ? parseDataCivil(deTexto) : null;
    const ateCivil = ateTexto ? parseDataCivil(ateTexto) : null;
    const de = deCivil ? dataParaIso(deCivil) : undefined;
    const ate = ateCivil ? dataParaIso(ateCivil) : undefined;
    if ((deTexto || ateTexto) && (!de || !ate || de > ate)) {
      throw new PublicError(422, "Selecione um período válido para o relatório.");
    }
    const estoque = await relatorioEstoque(env.DB);
    const atividade = de && ate ? await relatorioAtividade(env.DB, { de, ate }) : undefined;
    return c.json({ estoque, atividade });
  });
  app.get("/guias", async c => {
    const all = await listGuides(env.DB);
    return c.json({ guias: all.map(({ normalizada: _n, resultado: _r, ...guia }) => guia) });
  });
  app.get("/guias/:id", async c => {
    const detail = await guideDetail(env.DB, c.req.param("id"));
    if (!detail) throw new PublicError(404, "Guia não encontrada.");
    return c.json(detail);
  });
  app.post("/guias", async c => {
    const input = guideSchema.safeParse(await c.req.json());
    if (!input.success) throw new PublicError(422, "Confira os campos da guia e tente novamente.");
    return c.json(await handlers.registrarGuia(input.data));
  });
  app.post("/guias/:id/reconferir", async c => {
    if (!z.strictObject({}).safeParse(await c.req.json()).success) {
      throw new PublicError(422, "A reconferência usa somente os dados já salvos.");
    }
    try { return c.json(await reconferirGuia(env, c.req.param("id"))); }
    catch (error) {
      if (error instanceof PublicError && error.status === 429) c.header("Retry-After", "30");
      throw error;
    }
  });
  app.get("/importacoes", async c => {
    const rows = await env.DB.prepare(`SELECT id,arquivo_nome,iniciado_em FROM imports
      WHERE linhas_encontradas>0 ORDER BY iniciado_em DESC LIMIT 20`).all<{id:string;arquivo_nome:string;iniciado_em:string}>();
    const importacoes = [];
    for (const row of rows.results) {
      const lote = await lerProgresso(env.DB, row.id);
      if (lote) importacoes.push({ ...lote, arquivoNome: row.arquivo_nome, iniciadoEm: row.iniciado_em });
    }
    return c.json({ importacoes });
  });
  app.post("/importacoes", async c => {
    const input = importSchema.safeParse(await c.req.json());
    if (!input.success) throw new PublicError(422, "Selecione um CSV válido de até 50 KiB.");
    const lote = await withOperationalLock(env.DB, () => iniciarImportacao(env.DB, {
      csv: input.data.csv, arquivoNome: input.data.arquivo_nome ?? "guias.csv",
      idempotencyKey: input.data.idempotency_key ?? sha256Hex(input.data.csv),
      regras: catalogo, conferir, agora: new Date().toISOString(), tamanhoChunk: 3,
    }));
    return c.json({ lote, progresso: lote.progresso });
  });
  app.get("/importacoes/:id", async c => {
    const lote = await lerProgresso(env.DB, c.req.param("id"));
    if (!lote) throw new PublicError(404, "Importação não encontrada.");
    const linhas = (await lerLinhasDoLote(env.DB, lote.id)).map(l => ({ ...l,
      motivo: l.motivo ? (l.motivo.startsWith("id_guia") ? "Identificador da guia ausente ou inválido." :
        "Não foi possível processar esta linha. Confira o conteúdo e importe a correção.") : null,
    }));
    return c.json({ lote, progresso: lote.progresso, linhas });
  });
  app.post("/importacoes/:id/processar", async c => {
    const id = c.req.param("id");
    if (!await lerProgresso(env.DB, id)) throw new PublicError(404, "Importação não encontrada.");
    await withOperationalLock(env.DB, () => processarProximoChunk(env.DB, {
      loteId: id, dono: crypto.randomUUID(), conferir, agora: new Date().toISOString(),
    }));
    const lote = await lerProgresso(env.DB, id);
    return c.json({ lote, progresso: lote?.progresso });
  });
  app.post("/reset", async c => {
    const body = await c.req.json();
    if (body?.confirmacao !== "REINICIAR") throw new PublicError(422, "Confirme a ação digitando REINICIAR.");
    await withOperationalLock(env.DB, async () => {
      const running = await env.DB.prepare("SELECT id FROM imports WHERE status='PROCESSANDO' LIMIT 1").first();
      if (running) throw new PublicError(409, "Conclua a importação em andamento antes de reiniciar.");
      await env.DB.batch(["findings", "validations", "guide_revisions", "guides", "import_lines",
        "import_chunks", "imports", "semantic_extractions", "estado_global"].map(table => env.DB.prepare(`DELETE FROM ${table}`)));
    });
    return c.json({ ok: true });
  });
  return app;
}
