// Fronteira HTTP do Worker (issue #1, spec §3.2).
//
// Runtime Node puro via Vitest: a app e exercitada por `app.request(path, init)`
// com um `env.ASSETS` (Fetcher) instrumentado, sem pool de workers, sem
// Miniflare e sem rede. Cada caso afirma status, Content-Type e corpo, e prova
// que o fallback SPA nunca mascara health, namespaces reservados ou metodos nao
// GET, e que a delegacao a ASSETS ocorre no maximo uma vez e apenas apos o
// roteamento.

import { describe, it, expect } from "vitest";
import { createApp } from "../../src/worker/app";

const SERVICO = "vitalis-conferencia-preventiva-guias";

// Namespaces reservados: nunca navegacao, nunca delegados a ASSETS.
const NAMESPACES_RESERVADOS = [
  "/api/x",
  "/api/guias/2024",
  "/mcp",
  "/authorize",
  "/token",
  "/register",
  "/login",
  "/logout",
];

// Metodos mutaveis, inclusive fora dos namespaces reservados.
const METODOS_NAO_GET = [
  { method: "POST", path: "/rota-da-spa" },
  { method: "PUT", path: "/" },
  { method: "DELETE", path: "/algum" },
  { method: "POST", path: "/mcp" },
];

interface AssetsInstrumentado {
  assets: Fetcher;
  chamadas: Request[];
}

/**
 * Fetcher instrumentado: registra cada Request recebido e devolve uma Response
 * sentinela inconfundivel (HTML), permitindo afirmar delegacao, contagem de
 * chamadas e preservacao da resposta.
 */
function criarAssets(): AssetsInstrumentado {
  const chamadas: Request[] = [];
  const assets = {
    fetch: async (request: Request): Promise<Response> => {
      chamadas.push(request);
      return new Response("sentinela-assets", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  } as unknown as Fetcher;
  return { assets, chamadas };
}

function criarEnv(assets: Fetcher): Env {
  return { ASSETS: assets } as unknown as Env;
}

function contentType(resposta: Response): string {
  return resposta.headers.get("content-type") ?? "";
}

function afirmarJsonNaoHtml(resposta: Response, texto: string, contexto: string): void {
  expect(contentType(resposta), `${contexto}: Content-Type deve ser JSON`).toContain(
    "application/json",
  );
  expect(contentType(resposta), `${contexto}: Content-Type nao pode ser HTML`).not.toContain(
    "text/html",
  );
  expect(texto.toLowerCase(), `${contexto}: corpo nao pode ser fallback HTML`).not.toContain(
    "<html",
  );
}

// ---------------------------------------------------------------------------
// lt-worker-health-json
// ---------------------------------------------------------------------------

describe("lt-worker-health-json: GET /health responde JSON sem delegar a ASSETS", () => {
  it("responde 200, Content-Type application/json, corpo exato e zero chamadas a ASSETS", async () => {
    const { assets, chamadas } = criarAssets();
    const app = createApp(criarEnv(assets));

    const resposta = await app.request("/health");

    expect(resposta.status).toBe(200);
    expect(contentType(resposta)).toContain("application/json");
    expect(contentType(resposta)).not.toContain("text/html");
    expect(await resposta.json()).toEqual({ status: "ok", service: SERVICO });
    expect(chamadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// lt-worker-namespaces-reservados
// ---------------------------------------------------------------------------

describe("lt-worker-namespaces-reservados: namespaces e metodos nao GET sao 404 JSON sem ASSETS", () => {
  it("responde 404 JSON com erro concreto e zero delegacao em cada caso", async () => {
    const casos = [
      ...NAMESPACES_RESERVADOS.map((path) => ({ method: "GET", path })),
      ...METODOS_NAO_GET,
    ];

    for (const { method, path } of casos) {
      const contexto = `${method} ${path}`;
      const { assets, chamadas } = criarAssets();
      const app = createApp(criarEnv(assets));

      const resposta = await app.request(path, { method });
      const texto = await resposta.text();

      expect(resposta.status, `${contexto}: status`).toBe(404);
      afirmarJsonNaoHtml(resposta, texto, contexto);
      const corpo = JSON.parse(texto) as { error?: unknown };
      expect(typeof corpo.error, `${contexto}: objeto de erro concreto`).toBe("string");
      expect((corpo.error as string).length, `${contexto}: mensagem nao vazia`).toBeGreaterThan(0);
      expect(chamadas, `${contexto}: ASSETS nao pode ser chamado`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// lt-worker-delegacao-assets
// ---------------------------------------------------------------------------

describe("lt-worker-delegacao-assets: navegacao delegada uma vez e fallbacks JSON", () => {
  it("GET de navegacao sem Accept JSON e delegado uma unica vez e preserva a sentinela", async () => {
    for (const caminho of ["/", "/rota-da-spa"]) {
      const { assets, chamadas } = criarAssets();
      const app = createApp(criarEnv(assets));

      const resposta = await app.request(caminho, { method: "GET" });

      expect(resposta.status, `${caminho}: sentinela preservada no status`).toBe(200);
      expect(contentType(resposta), `${caminho}: sentinela preservada no Content-Type`).toContain(
        "text/html",
      );
      expect(await resposta.text(), `${caminho}: sentinela preservada no corpo`).toBe(
        "sentinela-assets",
      );
      expect(chamadas, `${caminho}: exatamente uma delegacao`).toHaveLength(1);
      expect(chamadas[0].method, `${caminho}: request original delegado`).toBe("GET");
      expect(new URL(chamadas[0].url).pathname, `${caminho}: URL original delegada`).toBe(
        new URL(`http://localhost${caminho}`).pathname,
      );
    }
  });

  it("GET de navegacao com Accept application/json responde 404 JSON sem delegar", async () => {
    for (const caminho of ["/", "/rota-da-spa"]) {
      const { assets, chamadas } = criarAssets();
      const app = createApp(criarEnv(assets));

      const resposta = await app.request(caminho, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const texto = await resposta.text();

      expect(resposta.status, `${caminho}: status`).toBe(404);
      afirmarJsonNaoHtml(resposta, texto, caminho);
      const corpo = JSON.parse(texto) as { error?: unknown };
      expect(typeof corpo.error, `${caminho}: objeto de erro concreto`).toBe("string");
      expect((corpo.error as string).length, `${caminho}: mensagem nao vazia`).toBeGreaterThan(0);
      expect(chamadas, `${caminho}: ASSETS nao pode ser chamado`).toHaveLength(0);
    }
  });

  it("sem ASSETS, GET de navegacao responde 503 JSON sem HTML inventado", async () => {
    for (const caminho of ["/", "/rota-da-spa"]) {
      const app = createApp({} as unknown as Env);

      const resposta = await app.request(caminho, { method: "GET" });
      const texto = await resposta.text();

      expect(resposta.status, `${caminho}: status`).toBe(503);
      afirmarJsonNaoHtml(resposta, texto, caminho);
      const corpo = JSON.parse(texto) as { error?: unknown };
      expect(typeof corpo.error, `${caminho}: objeto de erro concreto`).toBe("string");
      expect((corpo.error as string).length, `${caminho}: mensagem nao vazia`).toBeGreaterThan(0);
    }
  });
});
