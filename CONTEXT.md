
## Current product foundation

The project provides an executable Cloudflare/Vite/Hono/React foundation plus a pure deterministic TypeScript guide-conference core. The integrated baseline includes project wiring, the worker HTTP surface, and the domain core.

At aggregate HEAD `8203055f7f62fc76ba9723db469d087967d9941c`, after reconciling harness v3.4.0 from `origin/main`, the verified feature baseline is: `npm run typecheck`, `npm test`, and `npm run build` pass; `npm run check` reaches a dry-run with bindings `OAUTH_KV`, `CACHE_SEMANTICO`, `DB`, `AI`, `ASSETS`, and `LOADER`. The contract still leaves one explicit ambiguity for future work: malformed validity dates emit `data_invalida`, but §4.8 does not define an additional `autorizacao_vencida` limitation.
