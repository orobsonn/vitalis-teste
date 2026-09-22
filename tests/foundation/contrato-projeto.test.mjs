// Contrato de fundação do projeto — bootstrap RED sem dependências.
//
// Executa ANTES de existir qualquer dependência instalada:
//   node --test tests/foundation/contrato-projeto.test.mjs
//
// Regras de bootstrap: apenas módulos nativos do Node; a leitura de todo
// artefato degrada para `null` (arquivo ausente/ilegível/JSON inválido) e
// NENHUMA exceção é lançada no escopo do módulo. Toda afirmação vive dentro de
// um caso `test(...)` e falha por comparação de valores concretos, nunca por
// erro de import/resolução.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// O teste vive em tests/foundation/; a raiz do repositório fica dois níveis acima.
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

// ---------------------------------------------------------------------------
// Leitura tolerante (fallback null)
// ---------------------------------------------------------------------------

function readText(rel) {
  try {
    return readFileSync(path.join(RAIZ, rel), "utf8");
  } catch {
    return null;
  }
}

// Normalização JSONC mínima e segura: remove comentários // e /* */ sem tocar no
// conteúdo de strings e remove vírgulas finais. Não lança; a validação real
// acontece no JSON.parse do chamador.
function limparJsonc(texto) {
  let saida = "";
  let emString = false;
  let escapado = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (emString) {
      saida += c;
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') {
      emString = true;
      saida += c;
      continue;
    }
    if (c === "/" && texto[i + 1] === "/") {
      while (i < texto.length && texto[i] !== "\n") i += 1;
      saida += "\n";
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      i += 2;
      while (i < texto.length && !(texto[i] === "*" && texto[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    saida += c;
  }
  return saida.replace(/,(\s*[}\]])/g, "$1");
}

function readJson(rel) {
  const texto = readText(rel);
  if (texto === null) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function readJsonc(rel) {
  const texto = readText(rel);
  if (texto === null) return null;
  try {
    return JSON.parse(limparJsonc(texto));
  } catch {
    return null;
  }
}

// Faixa semver válida: o contrato aceita tanto a faixa baseline alvo quanto a
// divergência autorizada para a última estável publicada (o teste NÃO consulta o
// registro npm; as versões efetivas vêm do lockfile).
function ehFaixaSemverValida(valor) {
  if (typeof valor !== "string" || valor.trim() === "") return false;
  return valor
    .split("||")
    .map((grupo) => grupo.trim())
    .every((grupo) => {
      if (grupo === "") return false;
      return grupo.split(/\s+/).every((t) =>
        /^(\^|~|>=|<=|>|<|=)?v?(\d+(\.(\d+|x|X|\*)){0,2}([-+][0-9A-Za-z.-]+)?|\*|x|X)$/.test(t),
      );
    });
}

// ---------------------------------------------------------------------------
// Baseline (docs/arquitetura/mcp-oauth-codemode.md) — nomes exigidos
// ---------------------------------------------------------------------------

const DEPS_BASELINE = [
  "@cloudflare/codemode",
  "@cloudflare/workers-oauth-provider",
  "@modelcontextprotocol/sdk",
  "agents",
  "hono",
  "react",
  "react-dom",
  "react-router-dom",
  "zod",
];

const DEVS_BASELINE = [
  "@cloudflare/vite-plugin",
  "@cloudflare/vitest-pool-workers",
  "@cloudflare/workers-types",
  "@tailwindcss/vite",
  "@vitejs/plugin-react",
  "typescript",
  "vite",
  "vitest",
  "wrangler",
];

// ---------------------------------------------------------------------------
// Contrato 1 + 11: os sete scripts exatos (os quatro gates do projeto entre eles)
// ---------------------------------------------------------------------------

const SCRIPTS_ESPERADOS = {
  dev: "vite",
  typecheck: "tsc --noEmit",
  test: "node --test tests/foundation/contrato-projeto.test.mjs && vitest run",
  build: "npm run typecheck && vite build",
  "cf-typegen": "wrangler types",
  check: "npm run typecheck && vite build && wrangler deploy --dry-run",
  deploy: "npm run build && wrangler deploy",
};

test("contrato 1/11: package.json declara exatamente os sete scripts com os corpos exatos (inclui os gates typecheck/test/build/check)", () => {
  const pkg = readJson("package.json");
  assert.notEqual(pkg, null, "package.json ausente ou ilegível");
  assert.deepEqual(pkg.scripts, SCRIPTS_ESPERADOS);
});

// ---------------------------------------------------------------------------
// Contrato 2: pacotes do baseline declarados por nome, com faixa semver válida
// ---------------------------------------------------------------------------

test("contrato 2: package.json declara por nome os 18 pacotes do baseline com faixa semver válida, sem ausente", () => {
  const pkg = readJson("package.json");
  assert.notEqual(pkg, null, "package.json ausente ou ilegível");
  assert.ok(
    pkg.dependencies === undefined || (typeof pkg.dependencies === "object" && pkg.dependencies !== null),
    "dependencies deve ser objeto quando presente",
  );
  assert.ok(
    pkg.devDependencies === undefined || (typeof pkg.devDependencies === "object" && pkg.devDependencies !== null),
    "devDependencies deve ser objeto quando presente",
  );

  const declaradas = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const exigidas = [...DEPS_BASELINE, ...DEVS_BASELINE];

  const ausentes = exigidas.filter((nome) => !(nome in declaradas));
  assert.deepEqual(ausentes, [], `pacotes do baseline ausentes: ${ausentes.join(", ")}`);

  const invalidas = exigidas.filter((nome) => !ehFaixaSemverValida(declaradas[nome]));
  assert.deepEqual(invalidas, [], `faixas semver inválidas: ${invalidas.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Contrato 3: lockfile real, contendo e pinando cada dependência declarada
// ---------------------------------------------------------------------------

test("contrato 3: package-lock.json existe, contém cada dependência declarada e pina sua versão efetiva", () => {
  const pkg = readJson("package.json");
  assert.notEqual(pkg, null, "package.json ausente ou ilegível");
  const lock = readJson("package-lock.json");
  assert.notEqual(lock, null, "package-lock.json ausente ou ilegível");

  assert.equal(typeof lock.lockfileVersion, "number", "lockfileVersion deve ser numérico");
  assert.ok(lock.packages && typeof lock.packages === "object", "lock.packages deve existir");

  const declaradas = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ];

  const faltando = declaradas.filter((nome) => {
    const entrada = lock.packages[`node_modules/${nome}`];
    return !entrada || typeof entrada.version !== "string" || entrada.version.length === 0;
  });
  assert.deepEqual(faltando, [], `dependências sem entrada pinada no lockfile: ${faltando.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Contrato 4: tsconfig único e estrito com a topologia aprovada
// ---------------------------------------------------------------------------

test("contrato 4: tsconfig.json contém target/module/moduleResolution/moduleDetection/strict/noEmit/skipLibCheck/libs/types/jsx aprovados", () => {
  const tsconfig = readJsonc("tsconfig.json");
  assert.notEqual(tsconfig, null, "tsconfig.json ausente ou ilegível");
  const co = tsconfig.compilerOptions;
  assert.ok(co && typeof co === "object", "compilerOptions ausente");

  assert.deepEqual(
    {
      target: co.target,
      module: co.module,
      moduleResolution: co.moduleResolution,
      moduleDetection: co.moduleDetection,
      verbatimModuleSyntax: co.verbatimModuleSyntax,
      strict: co.strict,
      noEmit: co.noEmit,
      skipLibCheck: co.skipLibCheck,
      lib: co.lib,
      jsx: co.jsx,
    },
    {
      target: "ES2023",
      module: "ESNext",
      moduleResolution: "bundler",
      moduleDetection: "force",
      verbatimModuleSyntax: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      jsx: "react-jsx",
    },
  );

  assert.ok(Array.isArray(co.types), "types deve ser um array");
  assert.ok(co.types.includes("@cloudflare/workers-types"), "types deve conter @cloudflare/workers-types");
  assert.ok(co.types.includes("vite/client"), "types deve conter vite/client");
});

// ---------------------------------------------------------------------------
// Contrato 5: Vite com plugins na ordem aprovada e Vitest restrito
// ---------------------------------------------------------------------------

test("contrato 5: vite.config.ts usa plugins [react(), cloudflare(), tailwindcss()] e include tests/**/*.test.ts", () => {
  const texto = readText("vite.config.ts");
  assert.notEqual(texto, null, "vite.config.ts ausente ou ilegível");

  const plugins = texto.match(/plugins\s*:\s*\[([\s\S]*?)\]/);
  assert.notEqual(plugins, null, "array plugins ausente");
  assert.equal(
    plugins[1].replace(/\s+/g, "").replace(/,$/, ""),
    "react(),cloudflare(),tailwindcss()",
    "plugins devem ser, nesta ordem, react(), cloudflare(), tailwindcss()",
  );

  const include = texto.match(/include\s*:\s*\[([\s\S]*?)\]/);
  assert.notEqual(include, null, "include do Vitest ausente");
  const itens = [...include[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  assert.deepEqual(itens, ["tests/**/*.test.ts"]);
});

// ---------------------------------------------------------------------------
// Contrato 6: Wrangler com main, nodejs_compat, assets exato e os cinco bindings
// ---------------------------------------------------------------------------

const ASSETS_ESPERADO = {
  directory: "./dist/client",
  binding: "ASSETS",
  not_found_handling: "single-page-application",
  run_worker_first: true,
};
const DB_ESPERADO = {
  binding: "DB",
  database_name: "vitalis",
  database_id: "00000000-0000-0000-0000-000000000000",
};
const KV_ESPERADO = {
  binding: "OAUTH_KV",
  id: "00000000000000000000000000000000",
};
const LOADER_ESPERADO = { binding: "LOADER" };
const AI_ESPERADO = { binding: "AI" };

test("contrato 6: wrangler.jsonc contém main, nodejs_compat, bloco assets exato e bindings ASSETS/DB/OAUTH_KV/LOADER/AI", () => {
  const cfg = readJsonc("wrangler.jsonc");
  assert.notEqual(cfg, null, "wrangler.jsonc ausente ou ilegível");

  assert.equal(typeof cfg.main, "string", "main do Worker ausente");
  assert.match(cfg.main, /src\/worker\/index\.ts$/, `main inesperado: ${cfg.main}`);

  assert.deepEqual(cfg.compatibility_flags, ["nodejs_compat"]);
  assert.deepEqual(cfg.assets, ASSETS_ESPERADO);

  assert.ok(Array.isArray(cfg.d1_databases), "d1_databases ausente");
  assert.deepEqual(cfg.d1_databases.filter((e) => e && e.binding === "DB"), [DB_ESPERADO]);

  assert.ok(Array.isArray(cfg.kv_namespaces), "kv_namespaces ausente");
  assert.deepEqual(cfg.kv_namespaces.filter((e) => e && e.binding === "OAUTH_KV"), [KV_ESPERADO]);

  assert.ok(Array.isArray(cfg.worker_loaders), "worker_loaders ausente");
  assert.deepEqual(cfg.worker_loaders.filter((e) => e && e.binding === "LOADER"), [LOADER_ESPERADO]);

  assert.deepEqual(cfg.ai, AI_ESPERADO);
});

// ---------------------------------------------------------------------------
// Contrato 7: tipos Env geráveis por cf-typegen para os cinco bindings
// ---------------------------------------------------------------------------

test("contrato 7: worker-configuration.d.ts expõe Env com ASSETS/DB/OAUTH_KV/LOADER/AI", () => {
  const texto = readText("worker-configuration.d.ts");
  assert.notEqual(texto, null, "worker-configuration.d.ts ausente ou ilegível");

  const bloco = texto.match(/(?:interface|type)\s+Env\s*[={]([\s\S]*?)\n\}/);
  assert.notEqual(bloco, null, "declaração Env ausente");

  for (const nome of ["ASSETS", "DB", "OAUTH_KV", "LOADER", "AI"]) {
    assert.match(bloco[1], new RegExp(`\\b${nome}\\b\\s*:`), `binding ${nome} ausente em Env`);
  }
});

// ---------------------------------------------------------------------------
// Contrato 8: .gitignore cobre artefatos e segredos listados
// ---------------------------------------------------------------------------

const GITIGNORE_EXIGIDO = [
  "node_modules/",
  "dist/",
  "coverage/",
  ".wrangler/",
  "*.log",
  ".DS_Store",
  ".dev.vars",
  ".env*",
  "!.env.example",
];

test("contrato 8: .gitignore cobre node_modules/dist/coverage/.wrangler/*.log/.DS_Store/.dev.vars/.env*/!.env.example", () => {
  const texto = readText(".gitignore");
  assert.notEqual(texto, null, ".gitignore ausente ou ilegível");
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const faltando = GITIGNORE_EXIGIDO.filter((padrao) => !linhas.includes(padrao));
  assert.deepEqual(faltando, [], `padrões ausentes no .gitignore: ${faltando.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Contrato 9: shell da SPA com o título aprovado
// ---------------------------------------------------------------------------

test("contrato 9: index.html contém o título exato 'Vitalis — conferência preventiva de guias'", () => {
  const texto = readText("index.html");
  assert.notEqual(texto, null, "index.html ausente ou ilegível");
  const titulo = texto.match(/<title>([\s\S]*?)<\/title>/i);
  assert.notEqual(titulo, null, "tag <title> ausente");
  assert.equal(titulo[1], "Vitalis — conferência preventiva de guias");
});

// ---------------------------------------------------------------------------
// Contrato 10: COLUNAS_GUIA com as 18 colunas cruas, na ordem
// ---------------------------------------------------------------------------

const COLUNAS_ESPERADAS = [
  "id_guia",
  "unidade",
  "data_atendimento",
  "paciente",
  "convenio",
  "carteirinha",
  "cid",
  "procedimento_codigo",
  "procedimento_descricao",
  "numero_autorizacao",
  "autorizacao_validade",
  "autorizacao_sessoes_limite",
  "sessao_numero_na_autorizacao",
  "profissional",
  "profissional_registro",
  "valor",
  "observacao_recepcao",
  "data_lancamento",
];

test("contrato 10: COLUNAS_GUIA em src/domain/contratos.ts contém na ordem as 18 colunas cruas", () => {
  const texto = readText("src/domain/contratos.ts");
  assert.notEqual(texto, null, "src/domain/contratos.ts ausente ou ilegível");

  const array = texto.match(/COLUNAS_GUIA\s*=\s*\[([\s\S]*?)\]/);
  assert.notEqual(array, null, "array literal de COLUNAS_GUIA ausente");
  const colunas = [...array[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  assert.deepEqual(colunas, COLUNAS_ESPERADAS);
});
