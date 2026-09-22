import { Hono } from "hono";
import type { Context } from "hono";

/** Nome do servico devolvido pelo probe de health. */
const SERVICO = "vitalis-conferencia-preventiva-guias";

/**
 * Namespaces reservados a API/OAuth/MCP: nunca sao navegacao e nunca podem
 * cair no fallback de assets, mesmo em GET.
 */
const NAMESPACES_RESERVADOS = [
  "/api",
  "/mcp",
  "/authorize",
  "/token",
  "/register",
  "/login",
  "/logout",
] as const;

function pertenceANamespaceReservado(pathname: string): boolean {
  return NAMESPACES_RESERVADOS.some(
    (namespace) => pathname === namespace || pathname.startsWith(`${namespace}/`),
  );
}

/** Base fixa usada apenas para resolver segmentos de travessia (`.`/`..`). */
const BASE_CANONICA = "http://canonical.invalid";

/**
 * Limite de passes adicionais de decodificacao. Eles servem apenas para
 * CLASSIFICAR; a delegacao continua repassando o Request original. Se o limite
 * for atingido com escape percentual ainda remanescente, a classificacao falha
 * fechado (ver `pathnameNavegavel`).
 */
const PASSES_EXTRAS_MAXIMOS = 3;

/** Caracteres de controle que podem truncar o prefixo em runtimes intermediarios. */
const CARACTERE_DE_CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * Resolve o caminho ja decodificado contra `BASE_CANONICA` aplicando somente a
 * normalizacao de segmentos `.`/`..`, para revelar travessia percent-encoded
 * (`/x/%2e%2e%2fapi/x` -> `/api/x`).
 *
 * A resolucao e feita como caminho, nunca como referencia relativa: quando o
 * caminho comeca com `//`, a API de URL o interpretaria como *network-path
 * reference* (autoridade/host) e mudaria o pathname — `/%2ffoo/api/x` viraria
 * `/api/x` e bloquearia indevidamente navegacao legitima para `//foo/api/x`.
 * Prefixar `/.` mantem o caminho literal (`new URL("/.//foo/api/x", base).pathname
 * === "//foo/api/x"`) sem alterar a resolucao normal de `.`/`..` (`/x/../api/x`
 * continua `/api/x`). `?` e `#` decodificados sao caracteres de caminho (na URL
 * original vinham percent-encoded), entao sao re-encoded para nao truncarem o
 * caminho ao resolvermos `.`/`..`.
 */
function resolverComoCaminho(caminho: string): string | undefined {
  try {
    const semDelimitadores = caminho.replace(/[?#]/g, (caractere) =>
      encodeURIComponent(caractere),
    );
    const comoCaminho = semDelimitadores.startsWith("//")
      ? `/.${semDelimitadores}`
      : semDelimitadores;
    return new URL(comoCaminho, BASE_CANONICA).pathname;
  } catch {
    return undefined;
  }
}

/**
 * `true` quando o candidato ja decodificado precisa falhar fechado: contem
 * barra invertida (que a semantica WHATWG de URL trata como separador e usaria
 * para ofuscar o namespace, ex.: `/%5capi/x` -> `/\api/x`), contem caractere de
 * controle, ou pertence ao namespace reservado — lexicalmente (`/api/..`) ou
 * apos resolver `.`/`..` (`/x/%2e%2e%2fapi/x`).
 */
function caminhoReservadoOuInseguro(caminho: string): boolean {
  if (caminho.includes("\\") || CARACTERE_DE_CONTROLE.test(caminho)) {
    return true;
  }
  if (pertenceANamespaceReservado(caminho)) {
    return true;
  }
  const resolvido = resolverComoCaminho(caminho);
  return resolvido !== undefined && pertenceANamespaceReservado(resolvido);
}

/**
 * Classificacao deterministica e fail-closed do pathname. Decodifica o pathname
 * e o reavalia em passes extras limitados (dupla/tripla codificacao, ex.:
 * `/%2561pi/x` -> `/%61pi/x` -> `/api/x`). Retorna o caminho decodificado quando
 * o request pode seguir como navegacao; `undefined` quando ele deve virar 404
 * JSON sem tocar assets. Um escape invalido revelado por um passe extra
 * (`/rota%25x` -> `/rota%x`) interrompe a analise como NAO reservado, para nao
 * falhar fechado sobre navegacao legitima.
 *
 * Se o limite de passes for esgotado com escape percentual ainda remanescente,
 * a classificacao falha fechado: um prefixo reservado apenas um nivel mais
 * profundo (`/%2525252561pi/x`) nao pode ser provado inocente, entao o request
 * vira 404 JSON em vez de alcancar assets. Sem esse corte, o `break` devolveria
 * um caminho ainda codificado como se fosse navegacao legitima, vazando o
 * namespace reservado para o fallback SPA.
 */
function pathnameNavegavel(url: string): string | undefined {
  let caminho: string;

  try {
    caminho = decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }

  for (let passe = 0; passe <= PASSES_EXTRAS_MAXIMOS; passe += 1) {
    if (caminhoReservadoOuInseguro(caminho)) {
      return undefined;
    }
    if (!caminho.includes("%")) {
      break;
    }
    if (passe === PASSES_EXTRAS_MAXIMOS) {
      return undefined;
    }
    try {
      caminho = decodeURIComponent(caminho);
    } catch {
      break;
    }
  }

  return caminho;
}

function pedeJson(c: Context<{ Bindings: Env }>): boolean {
  const accept = c.req.header("accept");
  return typeof accept === "string" && accept.toLowerCase().includes("application/json");
}

function notFoundJson(c: Context<{ Bindings: Env }>): Response {
  return c.json({ error: "not_found" }, 404);
}

/**
 * Constroi a aplicacao Hono compartilhada pelo Worker.
 *
 * Precedencia HTTP (spec §3.2): o probe `/health` responde JSON primeiro;
 * namespaces reservados e qualquer metodo nao GET viram 404 JSON sem tocar
 * assets; apenas GET de navegacao fora dos namespaces reservados, sem
 * `Accept: application/json`, e delegado uma unica vez a `env.ASSETS` depois
 * do roteamento (503 JSON quando o binding nao existe).
 */
export function createApp(env: Env): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Guard global de metodo registrado antes de qualquer rota: o Hono converte
  // HEAD em dispatch GET, entao `app.get("/health")` seria selecionado por
  // `HEAD /health`. Aqui o metodo original e inspecionado antes do roteamento.
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET") {
      return notFoundJson(c);
    }
    await next();
  });

  app.get("/health", (c) =>
    c.json({ status: "ok", service: SERVICO }, 200),
  );

  app.all("*", async (c) => {
    if (c.req.method !== "GET" || pathnameNavegavel(c.req.url) === undefined) {
      return notFoundJson(c);
    }

    if (pedeJson(c)) {
      return notFoundJson(c);
    }

    const assets = env.ASSETS;
    if (!assets) {
      return c.json({ error: "assets_unavailable" }, 503);
    }

    return assets.fetch(c.req.raw);
  });

  return app;
}
