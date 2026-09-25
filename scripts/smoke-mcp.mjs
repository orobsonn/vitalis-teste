import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Tokens/credenciais são lidos e gravados somente em .local/, ignorado pelo Git.
// A saída é uma lista de resultados seguros; nunca contém corpos OAuth/headers.
const origin = new URL(process.env.VITALIS_URL || "https://vitalis.robsonlins.workers.dev").origin;
const local = new URL("../.local/", import.meta.url);
mkdirSync(local, { recursive: true, mode: 0o700 });
const credentials = readFileSync(new URL("demo-credentials.txt", local), "utf8");
const email = credentials.match(/^E-mail: (.+)$/m)?.[1];
const password = credentials.match(/^Senha: (.+)$/m)?.[1];
assert(email && password, "Arquivo privado de credenciais ausente/inválido.");
const evidence = { origin, executedAt: new Date().toISOString(), client: "@modelcontextprotocol/sdk", writesEnabled: process.argv.includes("--write"), rateLimitEnabled: process.argv.includes("--rate-limit"), checks: [] };
let stage = "início";
function success(name, data = {}) {
  evidence.checks.push({ name, ok: true, ...data });
  console.log(`PASS ${name}`);
}
function savePrivate(name, data) {
  const path = new URL(name, local);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
const cookies = new Map();
function remember(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"); const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
  const response = await fetch(new URL(path, origin), { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  remember(response);
  return response;
}
function hidden(html, name) {
  const value = html.match(new RegExp(`name="${name}" value="([A-Za-z0-9_-]+)"`))?.[1];
  assert(value, `Campo ${name} ausente na autorização.`);
  return value;
}
async function json(response, status) {
  assert.equal(response.status, status, `${stage}: HTTP ${response.status}`);
  return response.json();
}
function value(result) {
  assert(!result.isError, `${stage}: ferramenta retornou erro`);
  if (result.structuredContent) return result.structuredContent;
  return JSON.parse(result.content.filter(c => c.type === "text").map(c => c.text).join("\n"));
}
async function rejectedTool(name, args) {
  let rejected = false;
  try { rejected = (await client.callTool({ name, arguments: args })).isError === true; }
  catch (error) { rejected = typeof error?.code === "number" && error.code < 0; }
  assert(rejected, `${stage}: entrada deveria ser recusada`);
}
let client;
try {
  stage = "health";
  const health = await json(await request("/health"), 200);
  assert.equal(health.service, "vitalis-conferencia-preventiva-guias"); success(stage);
  stage = "MCP anônimo rejeitado";
  const anonymous = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(anonymous.status, 401); assert(anonymous.headers.get("www-authenticate")); success(stage);
  stage = "bearer inválido rejeitado";
  const invalidBearer = await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer E2E-TOKEN-INVALIDO" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert.equal(invalidBearer.status, 401); success(stage);
  stage = "OAuth discovery";
  const metadata = await json(await request("/.well-known/oauth-authorization-server"), 200);
  assert.equal(new URL(metadata.authorization_endpoint).origin, origin);
  assert.equal(new URL(metadata.token_endpoint).origin, origin);
  assert.equal(new URL(metadata.registration_endpoint).origin, origin); success(stage);
  stage = "Dynamic Client Registration";
  const redirectUri = "http://127.0.0.1:8976/callback";
  const registration = await json(await request(metadata.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Vitalis smoke SDK", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }) }), 201);
  assert(registration.client_id); success(stage);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const clientState = randomBytes(24).toString("base64url");
  const authorization = new URL(metadata.authorization_endpoint);
  for (const [k, v] of Object.entries({ response_type: "code", client_id: registration.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: clientState, resource: origin + "/mcp" })) authorization.searchParams.set(k, v);
  stage = "formulário OAuth PKCE";
  const authPage = await request(authorization);
  assert.equal(authPage.status, 200);
  const html = await authPage.text();
  const form = new URLSearchParams({ state: hidden(html, "state"), csrf_token: hidden(html, "csrf_token"), email, password });
  success(stage);
  stage = "CSRF ausente rejeitado";
  const invalidForm = new URLSearchParams(form); invalidForm.delete("csrf_token");
  assert.equal((await request(metadata.authorization_endpoint, { method: "POST", headers: { Origin: origin }, body: invalidForm })).status, 403); success(stage);
  stage = "login e consentimento OAuth";
  const authorized = await request(metadata.authorization_endpoint, { method: "POST", headers: { Origin: origin }, body: form });
  assert.equal(authorized.status, 302, `OAuth login HTTP ${authorized.status}`);
  const callback = new URL(authorized.headers.get("location"));
  assert.equal(callback.searchParams.get("state"), clientState);
  const code = callback.searchParams.get("code"); assert(code); success(stage);
  stage = "replay de estado rejeitado";
  assert.equal((await request(metadata.authorization_endpoint, { method: "POST", headers: { Origin: origin }, body: form })).status, 400); success(stage);
  stage = "troca de código PKCE";
  let tokens = await json(await request(metadata.token_endpoint, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: registration.client_id, redirect_uri: redirectUri, code, code_verifier: verifier, resource: origin + "/mcp" }) }), 200);
  assert(tokens.access_token && tokens.refresh_token);
  savePrivate("mcp-tokens.json", { origin, clientId: registration.client_id, tokens }); success(stage);
  stage = "refresh token";
  tokens = await json(await request(metadata.token_endpoint, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: registration.client_id, resource: origin + "/mcp" }) }), 200);
  assert(tokens.access_token && tokens.refresh_token);
  savePrivate("mcp-tokens.json", { origin, clientId: registration.client_id, tokens }); success(stage);
  stage = "SDK initialize";
  client = new Client({ name: "vitalis-smoke-real", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(origin + "/mcp"), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } });
  await client.connect(transport); success(stage);
  stage = "tools/list quatro ferramentas";
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(t => t.name).sort(), ["code", "consultar_regra", "registrar_guia", "verificar_guia"]); success(stage);
  const authorizedHeaders = { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  for (const [name, init, status] of [
    ["GET stateless rejeitado", { method: "GET" }, 405],
    ["JSON malformado rejeitado", { method: "POST", body: "{" }, 400],
    ["corpo HTTP acima de 64 KiB rejeitado", { method: "POST", body: JSON.stringify({ padding: "x".repeat(64 * 1024) }) }, 413],
  ]) {
    stage = name;
    const response = await request("/mcp", { ...init, headers: authorizedHeaders });
    assert.equal(response.status, status); success(stage);
  }
  for (const [name, tool, args] of [
    ["ferramenta desconhecida rejeitada", "ferramenta_inexistente", {}],
    ["campo desconhecido rejeitado", "verificar_guia", { guia: { id_guia: "E2E-SCHEMA", inventado: "x" } }],
    ["tipo numérico não é convertido", "verificar_guia", { guia: { valor: 62 } }],
    ["chave de idempotência vazia rejeitada", "registrar_guia", { guia: { id_guia: "E2E-SCHEMA-NAO-SALVAR" }, idempotency_key: "" }],
  ]) {
    stage = name; await rejectedTool(tool, args); success(stage);
  }
  const rawCatalog = JSON.parse(readFileSync(new URL("../docs/fontes/regras_convenio.json", import.meta.url), "utf8"));
  const input = { convenio: rawCatalog.convenios[0].nome, procedimento_codigo: rawCatalog.procedimentos[0].codigo };
  stage = "consultar_regra direta";
  const rule = value(await client.callTool({ name: "consultar_regra", arguments: input }));
  assert(rule.regras_versao && rule.procedimento); success(stage, { coverage: rule.cobertura });
  const guide = { guia: { id_guia: "E2E-MCP-20260925-001", ...input, paciente: "PACIENTE-FICTICIO-E2E", observacao_recepcao: "" }, referencia_temporal: "2026-09-25" };
  stage = "verificar_guia inédita sem salvar";
  const checked = value(await client.callTool({ name: "verificar_guia", arguments: guide }));
  assert.equal(checked.persistida, false); assert.equal(checked.checagem_textual, "nao_aplicavel"); success(stage, { decision: checked.decisao });
  stage = "code leitura com paridade";
  const viaCode = value(await client.callTool({ name: "code", arguments: { code: `async () => await codemode.verificar_guia(${JSON.stringify(guide)})` } }));
  assert.deepEqual(viaCode, checked); success(stage);
  for (const [name, codeText] of [
    ["code bloqueia escrita", 'async () => { try { await codemode.registrar_guia({guia:{id_guia:"NAO-DEVE-EXISTIR"},idempotency_key:"E2E-BLOQUEIO"}); return {blocked:false}; } catch { return {blocked:true}; } }'],
    ["code bloqueia fetch externo", 'async () => { try { await fetch("https://example.com/"); return {blocked:false}; } catch { return {blocked:true}; } }'],
    ["code bloqueia connect externo", 'async () => { try { const {connect}=await import("cloudflare:sockets"); const s=connect("example.com:443"); await s.opened; await s.close(); return {blocked:false}; } catch { return {blocked:true}; } }'],
  ]) {
    stage = name;
    const result = value(await client.callTool({ name: "code", arguments: { code: codeText } }));
    assert.equal(result.blocked, true); success(stage);
  }
  for (const [name, codeText] of [
    ["code saída acima de 128 KiB rejeitada", 'async () => "x".repeat(128 * 1024)'],
    ["code entrada interna acima de 64 KiB rejeitada", 'async () => await codemode.verificar_guia({guia:{observacao_recepcao:"x".repeat(64 * 1024)}})'],
  ]) {
    stage = name; await rejectedTool("code", { code: codeText }); success(stage);
  }
  stage = "code limita 20 chamadas internas";
  const callLimit = value(await client.callTool({ name: "code", arguments: { code: `async () => { let completed=0; for(let i=0;i<21;i++){try{await codemode.consultar_regra(${JSON.stringify(input)});completed++;}catch{return {completed,blocked:true};}}return {completed,blocked:false};}` } }));
  assert.equal(callLimit.completed, 20); assert.equal(callLimit.blocked, true); success(stage);
  stage = "code timeout real";
  const timeoutStarted = Date.now();
  const timeout = await client.callTool({ name: "code", arguments: { code: "async () => new Promise(resolve => setTimeout(() => resolve('late'), 6500))" } });
  const timeoutElapsed = Date.now() - timeoutStarted;
  assert.equal(timeout.isError, true);
  assert(timeoutElapsed >= 4_500 && timeoutElapsed < 15_000, "Tempo do deadline fora da janela esperada.");
  success(stage, { elapsedMs: timeoutElapsed });
  if (evidence.writesEnabled) {
    // Uma intenção por execução, com retries estáveis. O ID fica na evidência
    // para consultar o histórico, sem confundir execução nova com replay antigo.
    const runId = new Date().toISOString().replace(/\D/g, "");
    const args = { ...guide, guia: { ...guide.guia, id_guia: `E2E-MCP-WRITE-${runId}` }, idempotency_key: `E2E-MCP-${runId}-A` };
    stage = "sessão web disponível para conferir histórico E2E";
    await json(await request("/api/session"), 200); success(stage);
    stage = "registro concorrente com mesma chave tem um efeito";
    const raced = await Promise.all([0, 1].map(() => client.callTool({ name: "registrar_guia", arguments: args })));
    const accepted = raced.filter(r => !r.isError).map(value);
    assert(accepted.length >= 1);
    assert.equal(accepted.filter(r => r.tipo === "criada").length, 1);
    for (const r of raced.filter(r => r.isError)) assert.equal(r.structuredContent?.error?.status, 409);
    const saved = accepted.find(r => r.tipo === "criada");
    assert(saved.persistida); success(stage, { guideId: args.guia.id_guia, created: 1, concurrentConflicts: raced.filter(r => r.isError).length });
    stage = "registrar_guia idempotente";
    const retried = value(await client.callTool({ name: "registrar_guia", arguments: args }));
    assert.equal(retried.tipo, "reaproveitada"); assert.equal(retried.revisaoId, saved.revisaoId); success(stage);
    stage = "chave reutilizada com conteúdo diferente retorna 409";
    const conflict = await client.callTool({ name: "registrar_guia", arguments: { ...args, guia: { ...args.guia, unidade: "CONFLITO-FICTICIO" } } });
    assert(conflict.isError); assert.equal(conflict.structuredContent?.error?.status, 409); success(stage);
    stage = "correção B cria revisão preservando identidade";
    const corrected = value(await client.callTool({ name: "registrar_guia", arguments: { ...args, guia: { ...args.guia, unidade: "Norte" }, idempotency_key: `E2E-MCP-${runId}-B` } }));
    assert.equal(corrected.tipo, "criada"); assert.equal(corrected.idGuia, saved.idGuia); assert.notEqual(corrected.revisaoId, saved.revisaoId); success(stage);
    stage = "replay antigo de A mantém B vigente";
    const oldReplay = value(await client.callTool({ name: "registrar_guia", arguments: args }));
    assert.equal(oldReplay.tipo, "reaproveitada"); assert.equal(oldReplay.revisaoId, saved.revisaoId);
    assert.equal(oldReplay.revisaoReaproveitadaVigente, false); assert.equal(oldReplay.guia.original.unidade, "Norte"); success(stage);
    stage = "A para B para A reaproveita conteúdo histórico sem nova revisão";
    const historical = value(await client.callTool({ name: "registrar_guia", arguments: { ...args, idempotency_key: `E2E-MCP-${runId}-A-HISTORICO` } }));
    assert.equal(historical.tipo, "reaproveitada"); assert.equal(historical.revisaoId, saved.revisaoId);
    assert.equal(historical.revisaoReaproveitadaVigente, false); assert.equal(historical.guia.original.unidade, "Norte"); success(stage);
    stage = "histórico publicado confirma duas revisões e uma vigente";
    const detail = await json(await request(`/api/guias/${encodeURIComponent(saved.idGuia)}`), 200);
    assert.equal(detail.revisoes.length, 2); assert.equal(detail.revisoes.filter(r => r.vigente === 1).length, 1);
    assert.equal(detail.guia.revisaoNumero, 2); assert.equal(detail.guia.original.unidade, "Norte");
    assert.deepEqual(detail.revisoes.map(r => r.numero).sort(), [1, 2]); success(stage, { revisions: 2, current: 1, guideId: saved.idGuia });
  }
  // Opt-in: consome temporariamente a quota compartilhada demo/IP. Execute
  // somente depois de encerrar outros smokes e aguarde Retry-After para retomar.
  if (evidence.rateLimitEnabled) {
    stage = "rate limit publicado retorna 429 e Retry-After";
    const { verifyPublishedRateLimit } = await import("./smoke-mcp-rate-limit.mjs");
    const result = await verifyPublishedRateLimit({ origin, token: tokens.access_token });
    success(stage, { retryAfter: result.retryAfter, requests: result.attempts.length, elapsedMs: result.elapsedMs });
  }
  savePrivate("mcp-smoke-evidence.json", evidence);
  console.log(`Concluído: ${evidence.checks.length} verificações; escrita ${evidence.writesEnabled ? "ativada" : "desativada"}.`);
} catch {
  evidence.checks.push({ name: stage, ok: false });
  savePrivate("mcp-smoke-evidence.json", evidence);
  console.error(`FAIL ${stage}. Detalhes sensíveis omitidos; confira o serviço e os logs redigidos.`);
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
}
