import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Default: inspect only. Business writes require --write and an explicit selection.
// Credentials/cookies/CSRF and raw patient fields never enter logs or evidence.
const flags = new Set(process.argv.slice(2));
const allowed = new Set(["--write", "--all-observations", "--only-incomplete"]);
assert([...flags].every(flag => allowed.has(flag)), "Opção desconhecida.");
assert(!(flags.has("--all-observations") && flags.has("--only-incomplete")), "Escolha somente um filtro.");
const writesEnabled = flags.has("--write");
assert(!writesEnabled || flags.has("--all-observations") || flags.has("--only-incomplete"), "--write exige --all-observations ou --only-incomplete.");
const selection = flags.has("--only-incomplete") ? "only-incomplete" : "all-observations";
const origin = new URL(process.env.VITALIS_URL || "https://vitalis.robsonlins.workers.dev").origin;
const local = new URL("../.local/", import.meta.url);
mkdirSync(local, { recursive: true, mode: 0o700 });
const privateCredentials = readFileSync(new URL("demo-credentials.txt", local), "utf8");
const email = privateCredentials.match(/^E-mail: (.+)$/m)?.[1];
const password = privateCredentials.match(/^Senha: (.+)$/m)?.[1];
assert(email && password, "Credenciais privadas ausentes ou inválidas.");
const output = new URL("reconference-evidence.json", local);
const expected = { guias: 80, ok: 44, pendentes: 36, exposicaoCentavos: 269200 };
const evidence = { executedAt: new Date().toISOString(), origin, writesEnabled, selection,
  surface: "Reconferência HTTP publicada; não substitui E2E de navegador", expected, cases: [] };
const cookies = new Map();
let csrfToken;
let stage = "login";
function save() {
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  chmodSync(output, 0o600);
}
class HttpFailure extends Error { constructor(status) { super("Falha HTTP"); this.status = status; } }
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
  const response = await fetch(new URL(path, origin), { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(55_000) });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"); const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}
async function api(path, payload) {
  const response = await request(path, payload === undefined ? {} : { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "X-CSRF-Token": csrfToken }, body: JSON.stringify(payload) });
  if (response.status !== 200) throw new HttpFailure(response.status);
  return response.json();
}
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const currentRevision = detail => detail.revisoes.find(revision => revision.numero === detail.guia.revisaoNumero);
const historySize = detail => detail.revisoes.reduce((total, revision) => total + revision.validacoes.length, 0);
function snapshot(detail) {
  const revision = currentRevision(detail);
  assert(revision, "Revisão vigente ausente.");
  const active = revision.validacoes.filter(validation => validation.vigente === 1);
  assert.equal(active.length, 1, "Deve existir uma validação vigente.");
  return { revisionId: revision.id, revisionNumber: revision.numero,
    revisionCount: detail.revisoes.length, originalHash: digest(detail.guia.original),
    reference: detail.guia.resultado.referencia_temporal, validationId: active[0].id,
    promptVersion: active[0].inferenciaPromptVersao, textual: detail.guia.checagemTextual,
    decision: detail.guia.decisao, validationCount: historySize(detail) };
}
function verifyTransition(before, after, result) {
  const previous = snapshot(before); const next = snapshot(after);
  assert.equal(typeof result.recuperada, "boolean"); assert.equal(typeof result.jaConcluida, "boolean");
  assert(!(result.recuperada && result.jaConcluida));
  assert.deepEqual(result.guia, after.guia, "Resposta deve corresponder à guia persistida.");
  for (const key of ["revisionId", "revisionNumber", "revisionCount", "originalHash", "reference"]) {
    assert.deepEqual(next[key], previous[key], "Reconferência não altera conteúdo, revisão ou referência.");
  }
  if (!result.recuperada) {
    assert.deepEqual(after, before, "Tentativa sem recuperação não pode alterar histórico ou resultado.");
    if (result.jaConcluida) assert.equal(next.textual, "completa");
    return;
  }
  assert.equal(next.textual, "completa");
  assert.equal(next.validationCount, previous.validationCount + 1, "Apenas uma validação deve ser acrescentada.");
  assert.notEqual(next.validationId, previous.validationId);
  for (const oldRevision of before.revisoes) {
    const newRevision = after.revisoes.find(revision => revision.id === oldRevision.id);
    assert(newRevision, "Revisão histórica desapareceu.");
    const { validacoes: oldValidations, ...oldMetadata } = oldRevision;
    const { validacoes: newValidations, ...newMetadata } = newRevision;
    assert.deepEqual(newMetadata, oldMetadata);
    for (const oldValidation of oldValidations) {
      const preserved = newValidations.find(validation => validation.id === oldValidation.id);
      assert.deepEqual(preserved, { ...oldValidation,
        vigente: oldValidation.id === previous.validationId ? 0 : oldValidation.vigente }, "Conteúdo histórico deve ser preservado.");
    }
  }
}
function failure(error, where) {
  return { stage: where, kind: error instanceof HttpFailure ? "http_error" : error?.name === "AssertionError" ? "invariant_failure" : "request_or_response_error",
    ...(error instanceof HttpFailure ? { httpStatus: error.status } : {}) };
}

try {
  const page = await request("/login");
  if (page.status !== 200) throw new HttpFailure(page.status);
  const loginCsrf = (await page.text()).match(/name="csrf_token" value="([A-Za-z0-9_-]+)"/)?.[1];
  assert(loginCsrf, "CSRF do login ausente.");
  const login = await request("/login", { method: "POST", headers: { Origin: origin },
    body: new URLSearchParams({ email, password, csrf_token: loginCsrf }) });
  if (login.status !== 302) throw new HttpFailure(login.status);
  assert.equal(login.headers.get("location"), "/");
  const session = await api("/api/session"); assert(session.csrfToken); csrfToken = session.csrfToken;
  stage = "listar guias";
  const { guias } = await api("/api/guias");
  const withObservation = guias.filter(guide => guide.original.observacao_recepcao.trim());
  const selected = withObservation.filter(guide => selection === "all-observations" || guide.checagemTextual === "incompleta");
  evidence.initial = { guideCount: guias.length, observations: withObservation.length, selected: selected.length };
  evidence.beforeMetrics = (await api("/api/dashboard")).estoque;
  save();
  for (const guide of selected) {
    const item = { idGuia: guide.idGuia, writesEnabled }; evidence.cases.push(item);
    const path = `/api/guias/${encodeURIComponent(guide.id)}`;
    let caseStage = "ler detalhe anterior";
    try {
      const before = await api(path); item.before = snapshot(before);
      if (!writesEnabled) { item.outcome = "read_only"; item.ok = true; }
      else {
        caseStage = "reconferir";
        const started = Date.now(); const result = await api(`${path}/reconferir`, {});
        item.durationMs = Date.now() - started;
        caseStage = "validar estado persistido";
        const after = await api(path); item.after = snapshot(after);
        verifyTransition(before, after, result);
        item.outcome = result.recuperada ? "recovered" : result.jaConcluida ? "already_current" : "ai_incomplete_attempt";
        item.invariantsPreserved = true;
        if (result.recuperada || result.jaConcluida) {
          caseStage = "replay da versão atual";
          const replay = await api(`${path}/reconferir`, {});
          assert.equal(replay.recuperada, false); assert.equal(replay.jaConcluida, true);
          assert.deepEqual(replay.guia, after.guia);
          assert.deepEqual(await api(path), after, "Replay não pode acrescentar validação ou alterar dados.");
          item.replayWithoutWrites = true;
        }
        item.ok = item.outcome !== "ai_incomplete_attempt";
      }
    } catch (error) {
      item.ok = false; item.failure = failure(error, caseStage);
      // A timeout/HTTP error can have an uncertain write outcome. Read back
      // once for evidence; never blindly retry a mutation to force success.
      if (writesEnabled && item.before && !item.after) {
        try {
          item.after = snapshot(await api(path));
          item.changedAfterFailure = digest(item.after) !== digest(item.before);
        } catch (readError) { item.readBackFailure = failure(readError, "releitura após falha"); }
      }
    }
    save();
    console.log(JSON.stringify({ idGuia: item.idGuia, outcome: item.outcome, ok: item.ok, failure: item.failure }));
  }
  stage = "métricas finais";
  evidence.afterMetrics = (await api("/api/dashboard")).estoque;
  evidence.baselineDifferences = Object.entries(expected).filter(([key, expectedValue]) => evidence.afterMetrics[key] !== expectedValue)
    .map(([metric, expectedValue]) => ({ metric, expected: expectedValue, observed: evidence.afterMetrics[metric] }));
  evidence.summary = {
    selected: selected.length, recovered: evidence.cases.filter(item => item.outcome === "recovered").length,
    alreadyCurrent: evidence.cases.filter(item => item.outcome === "already_current").length,
    aiIncompleteAttempts: evidence.cases.filter(item => item.outcome === "ai_incomplete_attempt").length,
    httpErrors: evidence.cases.filter(item => item.failure?.kind === "http_error").length,
    serverErrors: evidence.cases.filter(item => item.failure?.httpStatus >= 500).length,
    invariantFailures: evidence.cases.filter(item => item.failure?.kind === "invariant_failure").length,
    passed: evidence.cases.every(item => item.ok) && evidence.baselineDifferences.length === 0,
  };
  console.log(JSON.stringify({ ...evidence.summary, baselineDifferences: evidence.baselineDifferences, writesEnabled }));
  if (!evidence.summary.passed) process.exitCode = 1;
} catch (error) {
  evidence.failure = failure(error, stage); process.exitCode = 1;
  console.error(JSON.stringify(evidence.failure));
} finally { evidence.completedAt = new Date().toISOString(); save(); }
