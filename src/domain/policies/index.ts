/**
 * Barrel das políticas determinísticas do domínio.
 *
 * Expõe as políticas puras dos sinais textuais validados (§3.5/§3.6). O
 * vocabulário fechado vive em `./contratos` e é consumido por `./textuais`.
 */

export { aplicarPoliticasTextuais } from "./textuais";
export type { PoliticasTextuais, TextualValidado } from "./textuais";
