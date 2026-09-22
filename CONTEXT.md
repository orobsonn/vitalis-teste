
## Current product foundation

The project provides an executable Cloudflare/Vite/Hono/React foundation plus a pure deterministic TypeScript guide-conference core. The integrated baseline includes project wiring, the worker HTTP surface, and the domain core.

At aggregate HEAD `903ba267caf5ee560fda362804aa27c8f46e8345`, aligned with `origin/main`, the verified baseline is: `npm run typecheck`, `npm test`, `npm run build`, and `npm run check` all pass; the dry-run exposes bindings `OAUTH_KV`, `DB`, `AI`, `ASSETS`, and `LOADER`. The contract still leaves one explicit ambiguity for future work: malformed validity dates emit `data_invalida`, but §4.8 does not define an additional `autorizacao_vencida` limitation.
