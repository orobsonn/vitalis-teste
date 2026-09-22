
## Current product foundation

The project provides an executable Cloudflare/Vite/Hono/React foundation plus a pure deterministic TypeScript guide-conference core. The integrated baseline includes project wiring, the worker HTTP surface, and the domain core.

At aggregate HEAD `82f1d09f0e65633bd7510e79efae05a707ab9514`, the verified baseline is: `npm run typecheck`, `npm test`, `npm run build`, and `npm run check` all pass; the dry-run exposes bindings `OAUTH_KV`, `DB`, `AI`, `ASSETS`, and `LOADER`.
