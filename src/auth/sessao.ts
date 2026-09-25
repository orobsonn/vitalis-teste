/**
 * Nucleo da sessao assinada do Worker (spec §5 / AC5).
 *
 * Contrato de fio: o cookie `__Host-vitalis_session` carrega o valor
 * `base64url(payload).base64url(HMAC-SHA-256(payload, COOKIE_ENCRYPTION_KEY))`,
 * em que `payload` e o JSON UTF-8 `{v:1, sub, iat, exp, csrf}` e `base64url` e o
 * base64 padrao sem `=` e com `+`/`/` normalizados para `-`/`_`.
 *
 * Este modulo expoe a primitiva de assinatura e a verificacao estrita usada
 * pela guarda do entrypoint; a tarefa de login reutiliza as mesmas funcoes para
 * emitir exatamente o formato verificado aqui, sem duplicar o contrato.
 */

import { chaveDeSessao } from "./segredos";

/** Nome do cookie de sessao (`__Host-` exige `Secure`, `Path=/`, sem `Domain`). */
export const NOME_COOKIE_SESSAO = "__Host-vitalis_session";

/** Versao do payload aceita pela verificacao. */
export const VERSAO_SESSAO = 1;

/** Duracao maxima da sessao, validada na leitura: `exp - iat <= 8 h`. */
export const TTL_MAXIMO_SESSAO_SEGUNDOS = 28800;

/** Identidade unica da demo (spec §4 "Identidade unica"): o payload so carrega `sub` fixo. */
export const SUJEITO_DEMO = "demo";

/** Conteudo confiavel do cookie depois da verificacao. */
export interface PayloadSessao {
  v: typeof VERSAO_SESSAO;
  sub: string;
  iat: number;
  exp: number;
  csrf: string;
}

/** Codifica bytes como base64url (sem padding), o formato do contrato de fio. */
export function codificarBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Decodifica base64url de forma estrita: normaliza o alfabeto, repoe padding e
 * devolve `undefined` em qualquer entrada invalida, sem lancar.
 */
export function decodificarBase64Url(
  texto: string,
): Uint8Array<ArrayBuffer> | undefined {
  if (texto.length === 0) {
    return undefined;
  }
  const normalizado = texto.replace(/-/g, "+").replace(/_/g, "/");
  const comPadding =
    normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
  try {
    const binario = atob(comPadding);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) {
      bytes[i] = binario.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

function bytesUtf8(texto: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(texto);
}

async function importarChaveHmac(
  chave: string,
  usos: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bytesUtf8(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usos,
  );
}

/**
 * Assina os bytes do payload com HMAC-SHA-256 e devolve o valor de cookie no
 * formato do contrato de fio. Reutilizado pelo login da proxima tarefa.
 */
export async function assinarPayload(
  chave: string,
  payload: PayloadSessao,
): Promise<string> {
  const payloadBytes = bytesUtf8(JSON.stringify(payload));
  const chaveHmac = await importarChaveHmac(chave, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chaveHmac, payloadBytes);
  return `${codificarBase64Url(payloadBytes)}.${codificarBase64Url(
    new Uint8Array(assinatura),
  )}`;
}

/**
 * Extrai o valor do cookie de sessao do cabecalho `Cookie`, quando presente.
 * Aceita `Cookie` nulo e nomes repetidos (usa a primeira ocorrencia).
 */
export function extrairCookieSessao(
  cabecalho: string | null | undefined,
): string | undefined {
  if (typeof cabecalho !== "string" || cabecalho.length === 0) {
    return undefined;
  }
  for (const parte of cabecalho.split(";")) {
    const separador = parte.indexOf("=");
    if (separador === -1) {
      continue;
    }
    if (parte.slice(0, separador).trim() === NOME_COOKIE_SESSAO) {
      return parte.slice(separador + 1).trim();
    }
  }
  return undefined;
}

function comoPayloadSessao(valor: unknown): PayloadSessao | undefined {
  if (typeof valor !== "object" || valor === null) {
    return undefined;
  }
  const registro = valor as Record<string, unknown>;
  if (registro.v !== VERSAO_SESSAO) {
    return undefined;
  }
  if (registro.sub !== SUJEITO_DEMO) {
    return undefined;
  }
  if (typeof registro.csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(registro.csrf)) {
    return undefined;
  }
  if (typeof registro.iat !== "number" || !Number.isInteger(registro.iat)) {
    return undefined;
  }
  if (typeof registro.exp !== "number" || !Number.isInteger(registro.exp)) {
    return undefined;
  }
  return {
    v: VERSAO_SESSAO,
    sub: registro.sub,
    iat: registro.iat,
    exp: registro.exp,
    csrf: registro.csrf,
  };
}

/**
 * Verifica a assinatura HMAC-SHA-256 sobre os bytes crus do payload.
 *
 * Usa `crypto.subtle.verify`, cuja comparacao acontece dentro do runtime e nao
 * faz retorno antecipado no primeiro byte divergente — o valor esperado nunca e
 * reconstruido e comparado em JS com curto-circuito.
 */
async function assinaturaValida(
  chave: string,
  payloadBytes: Uint8Array<ArrayBuffer>,
  assinaturaBytes: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const chaveHmac = await importarChaveHmac(chave, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    chaveHmac,
    assinaturaBytes,
    payloadBytes,
  );
}

/**
 * Verifica um valor de cookie e devolve o payload confiavel, ou `undefined`
 * quando o valor e malformado, tem assinatura invalida, esta vencido
 * (`exp <= agora`) ou excede a duracao maxima (`exp - iat > 28800`).
 *
 * Nunca lanca para entrada malformada: qualquer falha vira `undefined`.
 */
export async function verificarValorSessao(
  valor: string,
  chave: string,
  agoraEmSegundos: number = Math.floor(Date.now() / 1000),
): Promise<PayloadSessao | undefined> {
  if (valor.length > 4096) return undefined;
  const partes = valor.split(".");
  if (partes.length !== 2) {
    return undefined;
  }
  const [payloadB64, assinaturaB64] = partes;
  if (payloadB64.length === 0 || assinaturaB64.length === 0) {
    return undefined;
  }

  const payloadBytes = decodificarBase64Url(payloadB64);
  const assinaturaBytes = decodificarBase64Url(assinaturaB64);
  if (payloadBytes === undefined || assinaturaBytes === undefined) {
    return undefined;
  }

  let payload: PayloadSessao | undefined;
  try {
    payload = comoPayloadSessao(JSON.parse(new TextDecoder().decode(payloadBytes)));
  } catch {
    return undefined;
  }
  if (payload === undefined) {
    return undefined;
  }

  if (!(await assinaturaValida(chave, payloadBytes, assinaturaBytes))) {
    return undefined;
  }

  if (payload.exp <= agoraEmSegundos) {
    return undefined;
  }
  if (payload.iat > agoraEmSegundos || payload.iat < 0 || payload.exp <= payload.iat ||
      payload.exp - payload.iat > TTL_MAXIMO_SESSAO_SEGUNDOS) {
    return undefined;
  }

  return payload;
}

/**
 * Atalho da guarda: resolve a chave no `env`, extrai o cookie da requisicao e
 * devolve o payload verificado, ou `undefined` (fail closed) quando qualquer
 * pre-condicao falta.
 */
export async function lerSessaoDaRequisicao(
  env: unknown,
  requisicao: Request,
  agoraEmSegundos: number = Math.floor(Date.now() / 1000),
): Promise<PayloadSessao | undefined> {
  const chave = chaveDeSessao(env);
  if (chave === undefined) {
    return undefined;
  }
  const valor = extrairCookieSessao(requisicao.headers.get("Cookie"));
  if (valor === undefined) {
    return undefined;
  }
  return verificarValorSessao(valor, chave, agoraEmSegundos);
}
