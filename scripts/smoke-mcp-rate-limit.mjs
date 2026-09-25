import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Requisições sequenciais a D1 podem atravessar um minuto antes de atingir
// 60 chamadas. Alinhar à janela e usar grupos pequenos torna a prova válida.
export async function verifyPublishedRateLimit({ origin, token }) {
  const evidence = { executedAt: new Date().toISOString(), origin, writesEnabled: false, ok: false, attempts: [] };
  try {
    const health = await fetch(origin + "/health", { signal: AbortSignal.timeout(20_000) });
    assert.equal(health.status, 200);
    const serverDate = Date.parse(health.headers.get("date"));
    assert(Number.isFinite(serverDate));
    await health.arrayBuffer();
    const offset = serverDate % 60_000;
    const waitMs = offset <= 15_000 ? 0 : 61_000 - offset;
    evidence.waitForWindowMs = waitMs;
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    const started = Date.now();
    let limited;
    for (let batch = 0; batch < 13 && !limited; batch++) {
      const outcomes = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
        const id = batch * 5 + index + 1;
        const response = await fetch(origin + "/mcp", {
          method: "POST", signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" }),
        });
        const outcome = { id, status: response.status, serverDate: response.headers.get("date"), retryAfter: response.headers.get("retry-after") };
        await response.arrayBuffer();
        return outcome;
      }));
      evidence.attempts.push(...outcomes);
      assert(outcomes.every(item => item.status === 200 || item.status === 429), "Resposta diferente de 200/429 na prova de quota.");
      limited = outcomes.find(item => item.status === 429);
    }
    evidence.elapsedMs = Date.now() - started;
    assert(limited, "Quota não observada dentro da janela medida.");
    evidence.retryAfter = Number(limited.retryAfter);
    assert(evidence.retryAfter > 0 && evidence.retryAfter <= 60);
    evidence.ok = true;
    return evidence;
  } finally {
    const path = new URL("../.local/mcp-rate-limit-evidence.json", import.meta.url);
    writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    chmodSync(path, 0o600);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const auth = JSON.parse(readFileSync(new URL("../.local/mcp-tokens.json", import.meta.url), "utf8"));
    assert.equal(auth.origin, "https://vitalis.robsonlins.workers.dev");
    const result = await verifyPublishedRateLimit({ origin: auth.origin, token: auth.tokens.access_token });
    console.log(JSON.stringify({ ok: result.ok, requests: result.attempts.length, elapsedMs: result.elapsedMs, retryAfter: result.retryAfter, writesEnabled: false }));
  } catch {
    console.error("FAIL quota publicada; consulte a evidência privada de status/tempo, sem credenciais.");
    process.exitCode = 1;
  }
}
