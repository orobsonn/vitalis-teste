
## Cloudflare and deterministic-core lessons

- `wrangler types` 4.124–4.136 emits bindings in `interface __BaseEnv_Env { ... }`, followed by `interface Env extends __BaseEnv_Env {}`. Parsers must target the base interface rather than the empty runtime `interface Env {}` declaration.
- The deterministic corpus oracle is fixture-based rather than ID-lookup-based: 80 guides produced 0 parse failures, 32 structured pendências across 30 guides, 222000 associated cents, 30 `PENDENTE`, 50 `OK`, and 0 `prazo_envio_excedido`.
- The transitive `sharp` advisories from `@cloudflare/vitest-pool-workers` were resolved with `overrides: { "sharp": "^0.35.4" }`, without changing direct dependency ranges; `npm ci` then reported 0 vulnerabilities.
