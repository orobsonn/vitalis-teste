import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

// Avalia saídas reais já capturadas; nunca chama IA nem persiste guias.
const path = process.argv[2] || ".local/semantic-model-comparison.json";
const evidence = JSON.parse(readFileSync(path, "utf8"));
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, appType: "custom" });
try {
  const { validarExtracao } = await server.ssrLoadModule("/src/semantic/validacao.ts");
  evidence.evaluations = evidence.responses.map(response => {
    const item = evidence.cases.find(item => item.name === response.name);
    const result = validarExtracao(typeof response.response === "string" ? response.response : JSON.stringify(response.response), item.text);
    const signals = result.ok ? result.sinais.sinais.map(s => s.tipo).filter(s => s !== "nota_administrativa" || item.expectedSignals.includes(s)).toSorted() : [];
    const correctSignals = result.ok && JSON.stringify(signals) === JSON.stringify(item.expectedSignals.toSorted());
    const noUnexpectedAmbiguity = result.ok && (item.allowAmbiguity || JSON.stringify(result.sinais.ambiguidades.map(a => a.tipo).toSorted()) === JSON.stringify((item.expectedAmbiguities ?? []).toSorted()));
    return { name: item.name, model: response.model, elapsedMs: response.elapsedMs, valid: result.ok, error: result.ok ? null : result.erro,
      correctSignals, noUnexpectedAmbiguity: !!noUnexpectedAmbiguity, precise: correctSignals && !!noUnexpectedAmbiguity };
  });
  evidence.summary = [...new Set(evidence.responses.map(r => r.model))].map(model => {
    const rows = evidence.evaluations.filter(r => r.model === model), times = rows.map(r => r.elapsedMs).toSorted((a,b) => a-b);
    return { model, cases: rows.length, valid: rows.filter(r => r.valid).length, precise: rows.filter(r => r.precise).length,
      averageMs: Math.round(times.reduce((a,b) => a+b,0)/times.length), medianMs: (times[(times.length-1)>>1]+times[times.length>>1])/2, maxMs: Math.max(...times), failures: rows.filter(r => !r.precise) };
  });
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify(evidence.summary, null, 2));
} finally { await server.close(); }
