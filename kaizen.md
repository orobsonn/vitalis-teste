
## Harness improvement hypotheses

- Consider a validator mode that permits task-scope corrections only in `scope_paths`, `allowed_writes`, and `locked_tests` while reporting any other field change explicitly before rejection.
- Consider preflight detection for harness runtime hot-updates that modify `.pi/**`, so those paths are surfaced before scope inspection rather than discovered after the task runs.
- Consider recorder lineage checkpoints that survive launcher SIGTERM, avoiding recovery ambiguity when a test-only commit exists but the native producer record was lost.

- Hypothesis: require the execution plan to include a clause → observable behavior → focused test matrix for every approved specification clause. When review exposes gaps, perform a class-wide coverage sweep rather than case-by-case fixes; re-evaluate this workflow after the next multi-clause delivery.
