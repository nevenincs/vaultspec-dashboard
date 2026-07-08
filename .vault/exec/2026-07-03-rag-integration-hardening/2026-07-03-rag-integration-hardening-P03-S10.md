---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S10'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Update the frontend search tests for the new budget ordering, the flat-shape adapter vectors, and the freshness fields on the interpreted selector

## Scope

- `frontend/src/stores/server/searchController.test.ts + liveAdapters.test.ts + queries.test.ts`

## Description

- Rewrote the `adaptSearch` describe in `liveAdapters.test.ts` from the retired nested `{envelope:{data:{results}}}` vectors to the flat top-level-results shape: node-id annotation, snippet-as-excerpt, sparse tolerance, and result bounding all re-expressed flat. Replaced the reference-identity passthrough test (the mock short-circuit is gone) with a flat-body-adapts test. Added freshness coverage: `index_state` forwarded verbatim, `semantic_epoch` as a number, an explicit `null` epoch preserved as the honest absent marker, freshness omitted entirely on the degraded path, and a malformed `index_state` field dropped while the rest survives.
- Flipped the `envelope()` helper in `liveAdapters.search.test.ts` to the flat shape so the node-id-grammar and rich-field vectors feed top-level results.
- Added interpreted-selector freshness tests to `searchController.test.ts`: a results outcome surfaces raw `indexState` + `semanticEpoch` (asserting the `index_state` reference is forwarded, not cloned), a `null` epoch is preserved distinct from absent, and idle reports neither. Added a `mergeSemanticEpoch` describe covering number-over-null-over-undefined precedence.
- Added budget/payload guard tests to `queries.test.ts`: the client budget strictly exceeds the engine budget with >=1s margin (D2), and `SEARCH_MAX_RESULTS` equals `UNIFIED_SEARCH_RESULTS_MAX_ITEMS` and stays at/below the engine's 50 ceiling (D5). Exported `SEARCH_QUERY_TIMEOUT_MS` and added `ENGINE_SEARCH_BUDGET_MS` in `queries.ts` so the ordering invariant is guard-testable client-side.

## Outcome

The four affected suites pass through the live-engine vitest harness (its own fixture engine on an ephemeral port): 392 tests, 4 files, 0 failures. Typecheck clean on all touched files.

## Notes

- The harness ran against `engine/target/debug/vaultspec.exe`. The live `useSearchController` tests exercise the rag-absent DEGRADE path (shape-identical old and new), so the flat SUCCESS shape is validated by the unit vectors here and, end to end, by the rag-gated live test in P04 — not by this suite. The engine was NOT rebuilt (a concurrent agent holds uncommitted `ops.rs` edits; rebuilding would compile their WIP).
- The trailing `ECONNRESET`/`socket hang up` lines in the run are engine-teardown noise (the harness kills the engine mid-connection), not test failures.
- Pre-existing, unrelated: `frontend/src/app/right/RagOpsConsole.tsx` stranded WIP passes `className` to the kit `Button` (five `tsc` errors), outside P03 scope and not touched here — it will block a clean full `just dev lint frontend` until its own owner resolves it.
