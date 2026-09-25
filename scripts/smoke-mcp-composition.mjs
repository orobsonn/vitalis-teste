import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Complemento independente: duas provas, sem gravação e sem inferência.
// O smoke principal prepara o token privado; não imprimir headers/tokens.
const local = new URL("../.local/", import.meta.url);
const auth = JSON.parse(readFileSync(new URL("mcp-tokens.json", local), "utf8"));
assert.equal(auth.origin, "https://vitalis.robsonlins.workers.dev");
const examples = JSON.parse(readFileSync(new URL("../skills/conferir-guia/examples.json", import.meta.url), "utf8"));
const input = examples.reads.find(item => item.name === "ok").input;
const ruleInput = { convenio: input.guia.convenio, procedimento_codigo: input.guia.procedimento_codigo };
const evidence = { executedAt: new Date().toISOString(), origin: auth.origin, writesEnabled: false, checks: [] };
const client = new Client({ name: "vitalis-composition-smoke", version: "1.0.0" });
let stage = "conectar SDK";
function value(result) {
  assert(!result.isError);
  return result.structuredContent ?? JSON.parse(result.content.filter(item => item.type === "text").map(item => item.text).join("\n"));
}
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(auth.origin + "/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${auth.tokens.access_token}` } },
  }));
  stage = "procedimento conhecido não coberto";
  const uncovered = value(await client.callTool({ name: "consultar_regra", arguments: { convenio: "Vitalcard", procedimento_codigo: "40201015" } }));
  assert.equal(uncovered.cobertura, "nao_coberto");
  assert(uncovered.procedimento && uncovered.regras_versao);
  evidence.checks.push({ name: stage, ok: true, coverage: uncovered.cobertura });
  console.log(`PASS ${stage}`);
  stage = "Code Mode combina consulta e verificação com paridade";
  const directRule = value(await client.callTool({ name: "consultar_regra", arguments: ruleInput }));
  const directGuide = value(await client.callTool({ name: "verificar_guia", arguments: input }));
  const composed = value(await client.callTool({ name: "code", arguments: { code: `async () => ({ rule: await codemode.consultar_regra(${JSON.stringify(ruleInput)}), guide: await codemode.verificar_guia(${JSON.stringify(input)}) })` } }));
  assert.deepEqual(composed.rule, directRule);
  assert.deepEqual(composed.guide, directGuide);
  assert.equal(composed.rule.cobertura, "coberto");
  assert.equal(composed.guide.decisao, "OK");
  assert.equal(composed.guide.persistida, false);
  assert.equal(composed.guide.checagem_textual, "nao_aplicavel");
  evidence.checks.push({ name: stage, ok: true, primitives: ["consultar_regra", "verificar_guia"], decision: composed.guide.decisao });
  console.log(`PASS ${stage}`);
} catch {
  evidence.checks.push({ name: stage, ok: false });
  console.error(`FAIL ${stage}; detalhes sensíveis omitidos.`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  const path = new URL("mcp-composition-evidence.json", local);
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
