import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Smoke HTTP real: autenticação web, corpus fornecido, Workers AI real e D1.
// Credenciais e cookies nunca são impressos ou gravados na evidência.
const origin = new URL(process.env.VITALIS_URL || "https://vitalis.robsonlins.workers.dev").origin;
const local = new URL("../.local/", import.meta.url);
mkdirSync(local, { recursive: true, mode: 0o700 });
const privateCredentials = readFileSync(new URL("demo-credentials.txt", local), "utf8");
const email = privateCredentials.match(/^E-mail: (.+)$/m)?.[1];
const password = privateCredentials.match(/^Senha: (.+)$/m)?.[1];
assert(email && password, "Arquivo privado de credenciais ausente ou inválido.");
const csv = readFileSync(new URL("../docs/fontes/guias.csv", import.meta.url), "utf8");
const fileHash = createHash("sha256").update(csv).digest("hex");
const readOnly = process.argv.includes("--read-only");
const newUpload = process.argv.includes("--new-upload");
assert(!(readOnly && newUpload), "Escolha somente leitura ou novo upload.");
const body = { csv, arquivo_nome: "guias.csv", idempotency_key: newUpload ? `web-smoke-reupload-${randomUUID()}` : `web-smoke-corpus-v1-${fileHash}` };
const evidence = { readOnly, newUpload, origin, executedAt: new Date().toISOString(), surface: "API HTTP publicada (não E2E de navegador)", corpusSha256: fileHash, usesRealAI: true, checks: [], chunks: [] };
const evidencePath = new URL("web-smoke-evidence.json", local);
let stage = "início";
let csrfToken;
const cookies = new Map();
function save() { writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 }); chmodSync(evidencePath, 0o600); }
function pass(name, details = {}) { evidence.checks.push({ name, ok: true, ...details }); save(); console.log(`PASS ${name}`); }
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
  const response = await fetch(new URL(path, origin), { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(55_000) });
  for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(";"); const index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
  return response;
}
async function api(path, payload) {
  const response = await request(path, payload === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
  if (response.status !== 200) { evidence.failedHttpStatus = response.status; save(); throw new Error("Resposta HTTP inesperada"); }
  return response.json();
}
function totalizar(checks) { return checks.reduce((counts, value) => { counts[value] = (counts[value] ?? 0) + 1; return counts; }, {}); }
function revisionSnapshot(guias) { return guias.map(guia => [guia.id, guia.revisaoNumero, guia.processadoEm]).sort((a,b) => a[0].localeCompare(b[0])); }
try {
  stage = "GET login com cookie CSRF";
  const loginPage = await request("/login");
  assert.equal(loginPage.status, 200);
  const html = await loginPage.text();
  const loginCsrf = html.match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/)?.[1];
  assert(loginCsrf); pass(stage);
  stage = "POST login real";
  const login = await request("/login", { method: "POST", headers: { Origin: origin }, body: new URLSearchParams({ email, password, csrf_token: loginCsrf }) });
  if (login.status !== 302) evidence.failedHttpStatus = login.status;
  assert.equal(login.status, 302); assert.equal(login.headers.get("location"), "/"); pass(stage);
  stage = "sessão web autenticada";
  const session = await api("/api/session");
  assert.equal(session.user.email, email); assert(session.csrfToken); csrfToken = session.csrfToken; pass(stage);
  stage = "estado inicial do estoque";
  evidence.before = (await api("/api/dashboard")).estoque;
  pass(stage, { guias: evidence.before.guias });
  let beforeRevisions;
  if (newUpload) {
    assert.equal(evidence.before.guias, 80, "Novo upload exige o baseline de 80 guias antes da mutação.");
    beforeRevisions = revisionSnapshot((await api("/api/guias")).guias);
    evidence.beforeRevisionsHash = createHash("sha256").update(JSON.stringify(beforeRevisions)).digest("hex");
  }
  let current;
  if (!readOnly) {
  stage = "iniciar importação do corpus real";
  current = await api("/api/importacoes", body);
  assert.equal(current.lote.tamanhoChunk, 3); assert.equal(current.progresso.encontradas, 80);
  evidence.importId = current.lote.id;
  pass(stage, { linhas: current.progresso.encontradas, chunk: current.lote.tamanhoChunk });
  let chunks = 0;
  while (current.lote.status === "PROCESSANDO") {
    stage = `processar chunk ${chunks + 1}`;
    assert(chunks < 100, "Importação não atingiu estado terminal.");
    const started = Date.now();
    current = await api(`/api/importacoes/${encodeURIComponent(current.lote.id)}/processar`, {});
    const progress = current.progresso;
    evidence.chunks.push({ numero: ++chunks, duracaoMs: Date.now() - started, status: current.lote.status, ...progress });
    save(); console.log(`CHUNK ${chunks}: ${progress.processadas + progress.reaproveitadas + progress.comFalha}/${progress.encontradas}; falhas=${progress.comFalha}; status=${current.lote.status}`);
  }
  evidence.importacaoFinal = { status: current.lote.status, progresso: current.progresso };
  stage = "lote concluído sem falhas";
  assert.equal(current.lote.status, "CONCLUIDO"); assert.equal(current.progresso.comFalha, 0);
  assert.equal(current.progresso.processadas + current.progresso.reaproveitadas, 80); pass(stage);
  }
  stage = "leitura do estoque real";
  const dashboard = await api("/api/dashboard"); evidence.dashboard = dashboard.estoque;
  const { guias } = await api("/api/guias");
  evidence.decisoes = totalizar(guias.map(guia => guia.decisao));
  evidence.checagensTextuais = totalizar(guias.map(guia => guia.checagemTextual));
  evidence.motivos = totalizar(guias.flatMap(guia => guia.motivos.map(motivo => motivo.codigo)));
  evidence.revisoes = totalizar(guias.map(guia => String(guia.revisaoNumero)));
  save(); pass(stage);
  if (newUpload) {
    stage = "novo upload sem duplicar guias, revisões ou valores";
    assert.equal(current.progresso.reaproveitadas, 80);
    assert.equal(current.progresso.processadas, 0);
    assert.deepEqual(dashboard.estoque, evidence.before);
    assert.deepEqual(revisionSnapshot(guias), beforeRevisions);
    evidence.afterRevisionsHash = createHash("sha256").update(JSON.stringify(revisionSnapshot(guias))).digest("hex");
    pass(stage, { reaproveitadas: 80, chaveDiferente: true });
  }
  if (!readOnly) {
  stage = "reimportação idempotente";
  const repeated = await api("/api/importacoes", body);
  assert.equal(repeated.lote.id, current.lote.id); assert.equal(repeated.lote.status, current.lote.status);
  assert.deepEqual(repeated.progresso, current.progresso);
  const afterReplay = (await api("/api/dashboard")).estoque;
  assert.deepEqual(afterReplay, dashboard.estoque);
  const replayGuides = (await api("/api/guias")).guias;
  assert.deepEqual(replayGuides.map(guia => [guia.id, guia.revisaoNumero, guia.processadoEm]), guias.map(guia => [guia.id, guia.revisaoNumero, guia.processadoEm]));
  pass(stage);
  }
  stage = "totais de aceitação do corpus";
  const expected = { guias: 80, ok: 44, pendentes: 36, valorRegistradoCentavos: 569400, exposicaoCentavos: 269200, exposicaoEstruturadaCentavos: 222000, exposicaoTextualDuplicidadeCentavos: 47200, possivelExcessoCentavos: 16000, falhasProcessamento: 0 };
  evidence.expected = expected;
  evidence.differences = Object.entries(expected).filter(([key, value]) => dashboard.estoque[key] !== value).map(([key, value]) => ({ metrica: key, esperado: value, observado: dashboard.estoque[key] }));
  save();
  assert.equal(evidence.differences.length, 0); pass(stage, expected);
  console.log(`CONCLUÍDO ${readOnly ? "somente leitura; " : ""}${evidence.checks.length} verificações; 80 guias reais, 44 OK, 36 PENDENTE; evidência em .local/web-smoke-evidence.json.`);
} catch (error) {
  evidence.checks.push({ name: stage, ok: false });
  evidence.failureKind = error instanceof Error ? error.name : "UnknownError";
  evidence.completedAt = new Date().toISOString(); save();
  console.error(`FAIL ${stage}; dados sensíveis omitidos. Consulte .local/web-smoke-evidence.json.`);
  if (evidence.differences?.length) console.error(JSON.stringify({ divergencias: evidence.differences, checagensTextuais: evidence.checagensTextuais }));
  process.exitCode = 1;
} finally { evidence.completedAt = new Date().toISOString(); save(); }
