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

/** Caracteres de controle que podem truncar o prefixo em runtimes intermediarios. */
const CARACTERE_DE_CONTROLE = /[\u0000-\u001f\u007f]/;

/** Escape percentual de um unico byte (`%XX` com dois digitos hexadecimais). */
const ESCAPE_VALIDO = /%([0-9A-Fa-f]{2})/g;

/**
 * Decodificacao tolerante de UM passe: cada sequencia `%XX` valida e decodificada
 * byte a byte e os escapes invalidos (`%zz`, `%x`) permanecem literais. Diferente
 * de `decodeURIComponent`, nunca lanca, entao um escape invalido nao interrompe a
 * analise nem mascara um prefixo reservado valido presente no mesmo candidato
 * (ex.: `/%61pi/%zz` -> `/api/%zz`, que continua reservado).
 *
 * Quando nenhum escape valido resta, o resultado e identico a entrada: essa
 * ausencia de progresso e o sinal deterministico de parada (ver
 * `pathnameNavegavel`).
 */
function decodificarTolerante(caminho: string): string {
  return caminho.replace(ESCAPE_VALIDO, (_, hexadecimal: string) =>
    String.fromCharCode(Number.parseInt(hexadecimal, 16)),
  );
}

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
 * inicial com `decodeURIComponent` — se ele lanca, falha fechado (ex.: `/%zz`).
 * Em seguida reavalia o candidato em passes enquanto ele mudar e ainda contiver
 * `%` (dupla/tripla/… codificacao, ex.: `/%2561pi/x` -> `/%61pi/x` -> `/api/x`),
 * checando o namespace reservado e a inseguranca em CADA candidato. Retorna o
 * caminho decodificado quando o request pode seguir como navegacao; `undefined`
 * quando ele deve virar 404 JSON sem tocar assets.
 *
 * A iteracao usa PROGRESSO, nao um orcamento fixo de passes: cada passe valido
 * encurta estritamente a string e um passe sem escape valido a encerra. Assim um
 * escape invalido revelado por um passe extra (`/rota%25x` -> `/rota%x`) encerra
 * a analise como NAO reservado, sem over-blocking por profundidade de `%25`
 * (`/rota%2525252525x` chega a forma estavel `/rota%x` e delega). Um prefixo
 * reservado escondido sob qualquer numero de camadas de `%25` ainda e revelado
 * e bloqueado antes de alcancar assets.
 */
function pathnameNavegavel(url: string): string | undefined {
  let caminho: string;

  try {
    caminho = decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }

  while (true) {
    if (caminhoReservadoOuInseguro(caminho)) {
      return undefined;
    }
    if (!caminho.includes("%")) {
      break;
    }
    const proximo = decodificarTolerante(caminho);
    if (proximo === caminho) {
      // Nenhum escape valido restante: nenhum progresso, forma estavel.
      break;
    }
    caminho = proximo;
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
