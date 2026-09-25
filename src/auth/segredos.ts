/**
 * Resolucao de segredos de sessao a partir do `env` do Worker.
 *
 * A chave HMAC da sessao (`COOKIE_ENCRYPTION_KEY`) nao esta no `wrangler.jsonc`
 * versionado: em producao e um secret (`wrangler secret put`). Por isso o tipo
 * estrutural abaixo nao depende do `Env` gerado por `wrangler types` e a
 * ausencia do valor e tratada como falha fechada — nunca ha segredo padrao.
 */

/** Superficie minima do `env` necessaria para resolver o segredo de sessao. */
export interface EnvSegredosSessao {
  COOKIE_ENCRYPTION_KEY?: string | null;
}

/**
 * Devolve a chave HMAC da sessao quando o binding existe e e uma string nao
 * vazia; caso contrario devolve `undefined` (fail closed), sem default.
 */
export function chaveDeSessao(env: unknown): string | undefined {
  if (typeof env !== "object" || env === null) {
    return undefined;
  }
  const chave = (env as EnvSegredosSessao).COOKIE_ENCRYPTION_KEY;
  if (typeof chave !== "string" || chave.length < 32) {
    return undefined;
  }
  return chave;
}
