
## Cloudflare and deterministic-core lessons

- `wrangler types` 4.124–4.136 emits bindings in `interface __BaseEnv_Env { ... }`, followed by `interface Env extends __BaseEnv_Env {}`. Parsers must target the base interface rather than the empty runtime `interface Env {}` declaration.
- The deterministic corpus oracle is fixture-based rather than ID-lookup-based: 80 guides produced 0 parse failures, 32 structured pendências across 30 guides, 222000 associated cents, 30 `PENDENTE`, 50 `OK`, and 0 `prazo_envio_excedido`.
- The transitive `sharp` advisories from `@cloudflare/vitest-pool-workers` were resolved with `overrides: { "sharp": "^0.35.4" }`, without changing direct dependency ranges; `npm ci` then reported 0 vulnerabilities.

## Deterministic-core and routing invariants

- Catalog validation rejects duplicate set-valued entries, requires safe integer cents, preserves own `__proto__` definitions, deep-freezes accepted catalogs, and returns `{ok:false, erros}` without partial catalogs; rule queries propagate catalog limitations without repeating global limitations.
- CSV parsing preserves physical-row accounting: blank rows between data are cardinality failures, final terminators do not create rows, invalid headers fail each physical row, and recovery reparses only the remainder of the current record.
- Monetary aggregation saturates independently of operand order at `Number.MAX_SAFE_INTEGER`, records `soma_de_valores_nao_verificavel`, never treats rounded totals as valid, and deduplicates propagated global limitations.
- Motor checks remain independently gated by their contractual preconditions; exercise-deadline policy is emitted once with calendar-day counting. Worker pathname canonicalization fails closed for encoded backslashes, controls, lexical/resolved namespace escapes, tolerant-decoding abuse, and paths over the analysis budget.
