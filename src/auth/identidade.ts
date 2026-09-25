/**
 * Identidade unica da demonstracao e verificacao PBKDF2 (spec §4 / AC4/AC19).
 *
 * A conta demo nao tem tabela de usuarios: o e-mail vem de `DEMO_EMAIL`
 * (`trim().toLowerCase()`) e a senha e conferida contra `DEMO_PASSWORD_HASH`
 * por PBKDF2-HMAC-SHA-256 v1. Nenhum dos segredos esta no `wrangler.jsonc`
 * versionado, entao a leitura e estrutural (nao depende do `Env` gerado) e
 * qualquer ausencia/invalidez e falha fechada: a autenticacao devolve `false`
 * com o erro generico, nunca lanca para 500 nem cria bypass.
 */

/** Superficie estrutural minima do `env` para os segredos da conta demo. */
export interface EnvIdentidadeDemo {
  DEMO_EMAIL?: string | null;
  DEMO_PASSWORD_SALT?: string | null;
  DEMO_PASSWORD_HASH?: string | null;
  AUTH_PASSWORD_PEPPER?: string | null;
}

/** Parametros congelados do contrato §4 (PBKDF2-HMAC-SHA-256 v1). */
// Workers limita cada chamada PBKDF2 a 100.000 iterações. Pepper secreto
// independente e senha de demonstração aleatória complementam esse limite.
export const ITERACOES_PBKDF2 = 100_000;
export const TAMANHO_HASH_BYTES = 32;
export const LIMITE_SENHA_BYTES = 1024;

/** Normalizacao de e-mail do contrato: `trim().toLowerCase()`. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function textoNaoVazio(valor: unknown): string | undefined {
  if (typeof valor !== "string" || valor.length === 0) {
    return undefined;
  }
  return valor;
}

function utf8(texto: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(texto);
}

/**
 * Decodifica base64 padrao (aceita tambem o alfabeto base64url e padding
 * ausente). Qualquer entrada invalida devolve `undefined`, sem lancar.
 */
function decodificarBase64(texto: string): Uint8Array<ArrayBuffer> | undefined {
  const normalizado = texto.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (normalizado.length === 0) {
    return undefined;
  }
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

/**
 * Comparacao byte a byte sem retorno antecipado: acumula a diferenca com XOR
 * sobre o maior comprimento, incluindo a divergencia de tamanho, para que o
 * tempo nao dependa do primeiro byte diferente.
 */
function compararBytes(
  a: Uint8Array<ArrayBuffer>,
  b: Uint8Array<ArrayBuffer>,
): boolean {
  const n = Math.max(a.length, b.length);
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < n; i += 1) {
    diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diferenca === 0;
}

interface SegredosDemo {
  emailNormalizado: string;
  pepper: string;
  salt: Uint8Array<ArrayBuffer>;
  hash: Uint8Array<ArrayBuffer>;
}

/**
 * Le os quatro segredos demo. Falha fechada: qualquer campo ausente/vazio, salt
 * invalido ou hash que nao decodifica para exatamente 32 bytes devolve
 * `undefined` (sem excecao e sem segredo padrao). Um `DEMO_EMAIL` que
 * `normalizarEmail` reduz a string vazia (ex.: so espacos) tambem e recusado
 * aqui, antes de qualquer PBKDF2.
 */
export function lerSegredosDemo(env: unknown): SegredosDemo | undefined {
  if (typeof env !== "object" || env === null) {
    return undefined;
  }
  const registro = env as EnvIdentidadeDemo;
  const email = textoNaoVazio(registro.DEMO_EMAIL);
  const pepper = textoNaoVazio(registro.AUTH_PASSWORD_PEPPER);
  const saltTexto = textoNaoVazio(registro.DEMO_PASSWORD_SALT);
  const hashTexto = textoNaoVazio(registro.DEMO_PASSWORD_HASH);
  if (
    email === undefined ||
    pepper === undefined ||
    saltTexto === undefined ||
    hashTexto === undefined
  ) {
    return undefined;
  }
  const emailNormalizado = normalizarEmail(email);
  if (emailNormalizado.length === 0) {
    return undefined;
  }
  const salt = decodificarBase64(saltTexto);
  const hash = decodificarBase64(hashTexto);
  if (
    salt === undefined || salt.length < 16 ||
    hash === undefined ||
    hash.length !== TAMANHO_HASH_BYTES
  ) {
    return undefined;
  }
  return { emailNormalizado, pepper, salt, hash };
}

async function derivarHashDemo(
  pepper: string,
  senha: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const chave = await crypto.subtle.importKey(
    "raw",
    utf8(pepper + senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERACOES_PBKDF2, hash: "SHA-256" },
    chave,
    TAMANHO_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Verifica se `(email, senha)` e a unica credencial demo. Nunca lanca: qualquer
 * segredo ausente/invalido, senha acima de 1024 bytes (recusada ANTES do
 * PBKDF2), e-mail divergente ou hash divergente devolve `false`.
 *
 * O e-mail e o hash sao comparados em tempo constante e ambos os lados sao
 * calculados sempre, sem curto-circuito que distinga "e-mail inexistente" de
 * "senha errada".
 */
export async function verificarCredenciaisDemo(
  env: unknown,
  emailSubmetido: unknown,
  senhaSubmetida: unknown,
): Promise<boolean> {
  const segredos = lerSegredosDemo(env);
  if (segredos === undefined) {
    return false;
  }
  if (
    typeof emailSubmetido !== "string" ||
    typeof senhaSubmetida !== "string"
  ) {
    return false;
  }
  if (utf8(senhaSubmetida).length > LIMITE_SENHA_BYTES) {
    return false;
  }
  const derivado = await derivarHashDemo(
    segredos.pepper,
    senhaSubmetida,
    segredos.salt,
  );
  const emailOk = compararBytes(
    utf8(normalizarEmail(emailSubmetido)),
    utf8(segredos.emailNormalizado),
  );
  const hashOk = compararBytes(derivado, segredos.hash);
  return emailOk && hashOk;
}
