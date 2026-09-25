import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Somente leitura operacional. Requer a conta privada e o token do smoke OAuth.
// Snapshot D1 e dashboard deve ocorrer numa janela sem importação/correção.
// Dados de tabelas/cookies ficam em memória; evidência contém apenas hashes.
const local = new URL("../.local/", import.meta.url);
const auth = JSON.parse(readFileSync(new URL("mcp-tokens.json", local), "utf8"));
assert.equal(auth.origin, "https://vitalis.robsonlins.workers.dev");
const origin = auth.origin;
const credentials = readFileSync(new URL("demo-credentials.txt", local), "utf8");
const email = credentials.match(/^E-mail: (.+)$/m)?.[1];
const password = credentials.match(/^Senha: (.+)$/m)?.[1];
assert(email && password && auth.tokens.access_token);
const sample = JSON.parse(readFileSync(new URL("../skills/conferir-guia/examples.json", import.meta.url), "utf8")).reads[0].input;
const base = { ...sample, guia: { ...sample.guia, id_guia: "E2E-BORDA-LEITURA-001" } };
const evidence = { executedAt: new Date().toISOString(), origin, writesEnabled: false, checks: [] };
const headers = { Authorization: `Bearer ${auth.tokens.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const cookies = new Map();
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let lastRequest = 0;
async function pace() { const delay = 1100 - (Date.now() - lastRequest); if (delay > 0) await new Promise(r => setTimeout(r, delay)); lastRequest = Date.now(); }
async function request(path, init = {}) {
  const h = new Headers(init.headers);
  if (cookies.size) h.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
  const r = await fetch(new URL(path, origin), { ...init, headers: h, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  for (const cookie of r.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const i = pair.indexOf("="); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
  return r;
}
async function check(name, fn) {
  try { const result = await fn(); evidence.checks.push({ name, ok: true, ...result }); console.log(`PASS ${name}`); }
  catch (error) { evidence.checks.push({ name, ok: false, errorType: error?.name || "Error" }); console.error(`FAIL ${name}; detalhes omitidos.`); process.exitCode = 1; }
}
function databaseSnapshot() {
  const tables = ["guides", "guide_revisions", "validations", "findings", "imports", "import_lines", "import_chunks", "semantic_extractions", "estado_global"];
  const sql = tables.map(table => `SELECT * FROM ${table} ORDER BY rowid`).join("; ");
  const results = JSON.parse(execFileSync("./node_modules/.bin/wrangler", ["d1", "execute", "vitalis", "--remote", "--json", "--command", sql], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }));
  assert.equal(results.length, tables.length);
  return Object.fromEntries(tables.map((table, index) => { assert(results[index].success); return [table, { rows: results[index].results.length, sha256: digest(results[index].results) }]; }));
}
async function dashboardSnapshot() { const r = await request("/api/dashboard"); assert.equal(r.status, 200); return digest(await r.json()); }
let client;
try {
  const page = await request("/login"); assert.equal(page.status, 200);
  const csrf = (await page.text()).match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/)?.[1]; assert(csrf);
  const login = await request("/login", { method: "POST", headers: { Origin: origin }, body: new URLSearchParams({ email, password, csrf_token: csrf }) });
  assert.equal(login.status, 302);
  const beforeDatabase = databaseSnapshot();
  const beforeDashboard = await dashboardSnapshot();
  evidence.beforeDatabase = beforeDatabase; evidence.beforeDashboard = beforeDashboard;
  client = new Client({ name: "vitalis-edge-matrix", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), { requestInit: { headers } }));
  async function tool(name, args) { await pace(); return client.callTool({ name, arguments: args }); }
  async function reject(name, args) {
    let rejected = false;
    try { rejected = (await tool(name, args)).isError === true; } catch (error) { rejected = typeof error?.code === "number" && error.code < 0; }
    assert(rejected, "Entrada deveria ser rejeitada.");
  }
  async function value(name, args) {
    const r = await tool(name, args); assert(!r.isError);
    return r.structuredContent ?? JSON.parse(r.content.filter(c => c.type === "text").map(c => c.text).join("\n"));
  }
  const invalid = [
    ["consulta não aceita null", "consultar_regra", { convenio: null, procedimento_codigo: "50000470" }],
    ["consulta não aceita número", "consultar_regra", { convenio: "Vitalcard", procedimento_codigo: 50000470 }],
    ["consulta rejeita propriedade extra", "consultar_regra", { convenio: "Vitalcard", procedimento_codigo: "50000470", extra: true }],
    ["consulta convênio acima de 512", "consultar_regra", { convenio: "x".repeat(513), procedimento_codigo: "50000470" }],
    ["consulta código acima de 128", "consultar_regra", { convenio: "Vitalcard", procedimento_codigo: "x".repeat(129) }],
    ["guia null rejeitada", "verificar_guia", { guia: null }],
    ["guia array rejeitada", "verificar_guia", { guia: [] }],
    ["guia string rejeitada", "verificar_guia", { guia: "guia" }],
    ["campo booleano rejeitado", "verificar_guia", { guia: { valor: false } }],
    ["campo array rejeitado", "verificar_guia", { guia: { paciente: [] } }],
    ["campo objeto rejeitado", "verificar_guia", { guia: { convenio: {} } }],
    ["propriedade externa extra rejeitada", "verificar_guia", { ...base, salvar: true }],
    ["referência numérica rejeitada", "verificar_guia", { ...base, referencia_temporal: 20260902 }],
    ["referência civil impossível rejeitada", "verificar_guia", { ...base, referencia_temporal: "2026-02-30" }],
    ["referência vazia rejeitada", "verificar_guia", { ...base, referencia_temporal: "" }],
    ["campo acima de 300 rejeitado", "verificar_guia", { ...base, guia: { ...base.guia, paciente: "x".repeat(301) } }],
    ["observação acima de 1000 rejeitada antes da IA", "verificar_guia", { ...base, guia: { ...base.guia, observacao_recepcao: "x".repeat(1001) } }],
    ["registro com ID vazio não persiste", "registrar_guia", { guia: { id_guia: " " }, idempotency_key: "E2E-BORDA-INVALIDA" }],
    ["registro com chave whitespace não persiste", "registrar_guia", { guia: { id_guia: "E2E-BORDA-NAO-SALVAR" }, idempotency_key: " " }],
    ["registro com chave acima de 256 não persiste", "registrar_guia", { guia: { id_guia: "E2E-BORDA-NAO-SALVAR" }, idempotency_key: "x".repeat(257) }],
  ];
  for (const [name, toolName, args] of invalid) await check(name, () => reject(toolName, args));
  for (const [name, args] of [
    ["consulta vazia retorna cobertura indefinida", { convenio: "", procedimento_codigo: "" }],
    ["consulta desconhecida retorna cobertura indefinida", { convenio: "E2E-CONVENIO-INEXISTENTE", procedimento_codigo: "E2E-CODIGO" }],
    ["consulta aceita limite512 sem inventar cobertura", { convenio: "x".repeat(512), procedimento_codigo: "50000470" }],
  ]) await check(name, async () => { const r = await value("consultar_regra", args); assert.equal(r.cobertura, "indefinido"); });
  for (const [name, input] of [
    ["guia parcial sem referência permanece pendente", { guia: { id_guia: "E2E-BORDA-PARCIAL" } }],
    ["campos null não são inventados", { guia: { id_guia: "E2E-BORDA-NULL", convenio: null, valor: null, observacao_recepcao: null } }],
    ["guia vazia pode ser conferida sem salvar", { guia: {} }],
  ]) await check(name, async () => { const r = await value("verificar_guia", input); assert.equal(r.decisao, "PENDENTE"); assert.equal(r.referencia_temporal, null); assert.equal(r.persistida, false); assert.equal(r.checagem_textual, "nao_aplicavel"); });
  await check("fronteira300caracteres e observação1000espaços sem IA", async () => {
    const r = await value("verificar_guia", { ...base, guia: { ...base.guia, paciente: "x".repeat(300), observacao_recepcao: " ".repeat(1000) } });
    assert.equal(r.persistida, false); assert.equal(r.checagem_textual, "nao_aplicavel");
  });
  await check("referência explícita governa prazo sem alterar lançamento", async () => {
    const early = await value("verificar_guia", base);
    const late = await value("verificar_guia", { ...base, referencia_temporal: "2027-01-01" });
    assert.equal(early.decisao, "OK"); assert.equal(late.decisao, "PENDENTE");
    assert.equal(early.referencia_temporal, "2026-09-02"); assert.equal(late.referencia_temporal, "2027-01-01");
    assert.equal(late.persistida, false);
  });
  await check("referência omitida usa lançamento e não hoje", async () => {
    const r = await value("verificar_guia", { guia: base.guia }); assert.equal(r.referencia_temporal, "2026-09-02"); assert.equal(r.decisao, "OK");
  });
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  for (const [name, body, extra, status] of [
    ["content-type incorreto rejeitado", JSON.stringify(rpc), { "Content-Type": "text/plain" }, 415],
    ["Accept incompatível rejeitado", JSON.stringify(rpc), { Accept: "text/plain" }, 406],
    ["corpo vazio rejeitado", "", {}, 400],
    ["UTF8 inválido rejeitado", new Uint8Array([0xff]), {}, 400],
    ["Origin externo autenticado rejeitado", JSON.stringify(rpc), { Origin: "https://example.invalid" }, 403],
    ["Origin null autenticado rejeitado", JSON.stringify(rpc), { Origin: "null" }, 403],
    ["Origin própria autenticada aceita", JSON.stringify(rpc), { Origin: origin }, 200],
    ["versão MCP não suportada rejeitada", JSON.stringify(rpc), { "MCP-Protocol-Version": "1900-01-01" }, 400],
  ]) await check(name, async () => { await pace(); const r = await request("/mcp", { method: "POST", headers: { ...headers, ...extra }, body }); assert.equal(r.status, status); return { status: r.status }; });
  for (const [name, body] of [
    ["JSON-RPC sem versão rejeitado", { id: 1, method: "tools/list" }],
    ["JSON-RPC método numérico rejeitado", { jsonrpc: "2.0", id: 1, method: 10 }],
    ["JSON-RPC método inexistente rejeitado", { jsonrpc: "2.0", id: 1, method: "metodo_inexistente" }],
    ["JSON-RPC batch vazio rejeitado", []],
    ["JSON-RPC batch não vazio rejeitado", [rpc]],
    ["JSON-RPC null rejeitado", null],
    ["JSON-RPC escalar rejeitado", true],
  ]) await check(name, async () => { await pace(); const r = await request("/mcp", { method: "POST", headers, body: JSON.stringify(body) }); assert(r.status < 500); const payload = await r.json(); assert(typeof payload.error?.code === "number" && payload.error.code < 0); return { status: r.status, rpcCode: payload.error.code }; });
  await check("Code Mode não recebe bindings nem secrets do host", async () => {
    const r = await value("code", { code: 'async () => { const names=["DB","AI","LOADER","OAUTH_KV","CACHE_SEMANTICO","DEMO_EMAIL","DEMO_PASSWORD_HASH","AUTH_PASSWORD_PEPPER","COOKIE_ENCRYPTION_KEY"]; const envObject=typeof env==="object"&&env!==null?env:{}; const p=typeof process==="object"&&process!==null?process.env??{}:{}; return {exposed:names.filter(k=>globalThis[k]!==undefined||envObject[k]!==undefined||p[k]!==undefined)}; }' }); assert.deepEqual(r.exposed, []);
  });
  await check("Code Mode não acessa aplicação por rede interna", async () => {
    const r = await value("code", { code: `async () => {try{await fetch(${JSON.stringify(origin + "/health")});return{blocked:false};}catch{return{blocked:true};}}` }); assert.equal(r.blocked, true);
  });
  await check("Code Mode não importa módulo node para processos", async () => {
    const r = await value("code", { code: 'async () => {try{await import("node:child_process");return{blocked:false};}catch{return{blocked:true};}}' }); assert.equal(r.blocked, true);
  });
  await check("zero alterações em nove tabelas D1 operacionais", async () => { const after = databaseSnapshot(); evidence.afterDatabase = after; assert.deepEqual(after, beforeDatabase); });
  await check("dashboard idêntico antes e depois das leituras", async () => { const after = await dashboardSnapshot(); evidence.afterDashboard = after; assert.equal(after, beforeDashboard); });
} catch {
  evidence.checks.push({ name: "preparação ou snapshot", ok: false }); console.error("FAIL preparação/snapshot; detalhes sensíveis omitidos."); process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  const path = new URL("mcp-edges-evidence.json", local); writeFileSync(path, JSON.stringify(evidence, null, 2), { mode: 0o600 }); chmodSync(path, 0o600);
  console.log(JSON.stringify({ checks: evidence.checks.length, passed: evidence.checks.filter(c => c.ok).length, writesEnabled: false }));
}
