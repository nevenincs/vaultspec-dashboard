---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S12'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Add the frontend rag-gated live success test: gate on the served tiers reporting the semantic tier available, drive a real settled query through useSearchController, and skip with a stated reason otherwise

## Scope

- `frontend/src/stores/server/searchController.test.ts`

## Description

- Append one rag-gated live success test to the existing live `useSearchController` suite, mirroring the suite's real-engine wiring conventions (the shared `liveScope` / `liveTransport`, the `renderHook` + `waitFor` terminal-state pattern).
- Drive a real settled query through `useSearchController` against the fixture serve and wait for a terminal state.
- Gate on served tiers truth read through the controller: when the interpreted view is `semanticOffline` (the tiers-gated semantic-unavailable signal) or in the transport-error state, call the vitest test context `skip()` with a stated reason instead of asserting a chain that cannot run without a resident rag.
- On the semantic-available path, assert the outcome is a real semantic terminal state (`results` or `no-results`, never the offline fallback), that the served freshness fields ride the interpreted view (`semanticEpoch` a number or an explicit null, `indexState` an object or undefined per the adapter contract), and that every hit carries the annotated `node_id` key.

## Outcome

The live test ran LIVE here and passed (5.3s), NOT skipped: the fixture serve — which scopes a scratch copy of the fixture vault on an ephemeral port — discovered the resident machine-global rag, so the semantic tier came back available and the success-path assertions executed. The scratch fixture root is unindexed by rag, so the honest outcome was a semantic `no-results` that still carried the freshness envelope (`semanticEpoch` null from a cold epoch cache, `indexState` forwarded as an object). On a rag-less machine the same test skips honestly via the test-context `skip()` with the stated reason. Gates: the targeted `vitest run` green (51 tests, 0 failed) and the full `just dev lint frontend` (px scan, prettier, tsc, tokens, figma names, eslint) exit 0.

## Notes

The frontend harness selects the freshest engine binary by mtime from the debug/release target dirs. A pre-existing dev `vaultspec serve` (port 8767, not started by this work) held the debug binary; a read-only query confirmed that already-built binary serves the new `index_state` / `semantic_epoch` fields with `tiers.semantic.available` true and `node_id` on every hit, so the harness serves the current contract and no rebuild was needed (nor possible without disturbing the running dev server). The socket-hang-up / ECONNRESET lines in the run are the engine teardown killing the spawned fixture serve, unrelated to the assertions. vitest 4.1.8 supports the runtime test-context `skip()` used for the honest gate.
