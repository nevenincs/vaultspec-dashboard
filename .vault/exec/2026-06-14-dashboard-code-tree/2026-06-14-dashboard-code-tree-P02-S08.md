---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---




# Mirror the /file-tree response shape in the frontend mock fixtures

## Scope

- `frontend/src/stores/server/`

## Description

- Mirror the `/file-tree` response shape in the frontend mock so the SPA client and everything above it run unchanged against both the mock and the live origin (the one-code-path property).
- Add a `codeTree` path-set fixture to the synthetic corpus (already-ignore-filtered repo-relative paths, some mapping to existing `code:` graph nodes, some not).
- Add the `/file-tree` mock route deriving ONE directory level per call from the flat path set, with dirs-before-files ordering, the shared `code:<path>` node id, the `truncated` honesty block, a top-level `next_cursor`, and honest `structural` degradation under `setNoVault`.
- Add the tolerant `adaptFileTree` live adapter and preserve the top-level `next_cursor` through `unwrapEnvelope`.

## Outcome

- Verified: the existing `liveAdapters` and `mockEngine` unit suites still pass with the additions, and the full frontend suite is green (845 passed, 0 failed).
- DEFERRED (all entangled with peer pipeline-wire / workspace-registry edits): `frontend/src/testing/mockEngine.ts` (the `/file-tree` route + `fileTreeData` + `setFileTreeLevelCap` + `degradedTiersFor`), `frontend/src/testing/fixtures/corpus.ts` (the `codeTree` fixture), `frontend/src/stores/server/liveAdapters.ts` (`adaptFileTree` + the `next_cursor`-preserving `unwrapEnvelope`).

## Notes

- The mock derives levels from a flat path set exactly as the live engine lists one level per call, and it emits the live wire shape (flat-with-tiers, `next_cursor` at the top level) so the real client + `adaptFileTree` path is exercised, never bypassed — honoring the mock-mirrors-live-wire-shape discipline.
- DEFERRED COMMITS: every mock/fixture/adapter file carries heavy uncommitted peer work, so all are implemented in-tree and left uncommitted. The `unwrapEnvelope` change is additive and tolerant (it only preserves a top-level `next_cursor`), so peer consumers are unaffected — confirmed by the green peer suites.
