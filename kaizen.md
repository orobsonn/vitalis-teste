
## Harness improvement hypotheses

- Consider a validator mode that permits task-scope corrections only in `scope_paths`, `allowed_writes`, and `locked_tests` while reporting any other field change explicitly before rejection.
- Consider preflight detection for harness runtime hot-updates that modify `.pi/**`, so those paths are surfaced before scope inspection rather than discovered after the task runs.
- Consider recorder lineage checkpoints that survive launcher SIGTERM, avoiding recovery ambiguity when a test-only commit exists but the native producer record was lost.

- Hypothesis: require the execution plan to include a clause → observable behavior → focused test matrix for every approved specification clause. When review exposes gaps, perform a class-wide coverage sweep rather than case-by-case fixes; re-evaluate this workflow after the next multi-clause delivery.

- Hypothesis: when a canonical plan changes after task admission, recovery should recompute and persist each `recovered_task_contract_sha256` at claim creation; `resume` alone cannot restore missing lineage. Evidence: `.pi/harness/lib/task-run.mjs:224-227` computes the hash during admission, while `.pi/harness/lib/task-receipts.mjs:921-924` requires it during integrated validation.
- Hypothesis: task-marker recovery should expose the active producer lifecycle explicitly; `hand-finished` depends on the exact producer dispatch record, so after capture consumes that record a marker-only reinspeção cannot certify the current producer. Evidence: `.pi/harness/lib/entry-gate.mjs:1148-1159` and `.pi/harness/extensions/harness-dispatch.ts:64-66`.
- Hypothesis: correction-barrier diagnostics should preserve the upstream owner and prescribed integrate/resume path through final review instead of collapsing to generic missing evidence. Evidence: `.pi/harness/lib/task-receipts.mjs:975-978`, `.pi/harness/lib/task-coordinator.mjs:869-875`, and `.pi/harness/lib/marker-authority.mjs:125-130`.
- Hypothesis: when final review finds the same defect class in multiple modules, perform a class-wide sweep before closing it rather than fixing only the first case. Evidence: the shared snapshot/callable guards in `src/semantic/conferencia.ts:1279-1286` and `src/semantic/workers-ai.ts:19-31,230-234`, with focused coverage in `tests/semantic/conferencia.test.ts` and `tests/semantic/workers-ai.test.ts`.
