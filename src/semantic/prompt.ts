/**
 * Acoplamento do prompt canônico versionado.
 *
 * O texto é importado cru do artefato `prompts/observacao/v1.md` e o hash do
 * conteúdo é derivado do mesmo `sha256` compartilhado. Trocar o conteúdo sem
 * trocar a constante ainda invalida o cache, porque a versão efetiva combina a
 * constante literal com o hash do conteúdo (§3.2/§3.8).
 */

import textoPrompt from "../../prompts/observacao/v1.md?raw";
import { sha256Hex } from "../shared/sha256";

/** Constante de versão literal do prompt de extração. */
// Inclui a estratégia de geração: a adoção de JSON mode invalida o cache anterior.
export const VERSAO_PROMPT = "observacao-v3-scout";

/** Conteúdo cru do artefato canônico `prompts/observacao/v1.md`. */
export const TEXTO_PROMPT: string = textoPrompt;

/** Hash `sha256` de um texto de prompt, em hexadecimal minúsculo. */
export function hashDoPrompt(texto: string): string {
  return sha256Hex(texto);
}

/** Hash do conteúdo do prompt canônico atual. */
export const PROMPT_HASH: string = hashDoPrompt(TEXTO_PROMPT);

/** Versão efetiva registrada no resultado e usada na chave de cache. */
export function versaoEfetivaDoPrompt(): string {
  return `${VERSAO_PROMPT}+sha256:${PROMPT_HASH}`;
}
