---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S05'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Add the useCodeFiles query hook with bounded cache keyed on scope, walked to completion so client narrowing holds the complete listing

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Verified the `codeFiles` query key in `engineKeys` (keyed on scope alone — one
  bounded cache entry per corpus, default gcTime bounding retention).
- Verified `useCodeFiles` hook and `normalizeCodeFilesRequestIdentity`, mirroring
  `useVaultTree`: enabled only on a valid scope, driving the cursor-walking
  client so the reader holds the complete listing to narrow.
- Verified the committed tests: request-identity normalization, the no-scope
  cache-isolation guard, and a live-wire test rendering `useCodeFiles` against
  the real engine asserting drained entries, honest null truncation, and every
  entry a navigable `code:{path}` node.
- Added `"code-files"` to `SCOPED_ENGINE_QUERY_SUBTREES` and
  `GRAPH_GENERATION_QUERY_SUBTREES` (omitted from the prior commit): a scope
  swap must evict the prior corpus's listing; a graph-generation bump must
  re-fetch the updated projection.
- Updated the two guard tests and the vault-mutation `affectedKeys` test to
  enroll `engineKeys.codeFiles("wt-1")` / `engineKeys.codeFiles(scope)`.

## Outcome

`"code-files"` fully enrolled in the scope-swap and generation-refresh boundaries.
All 250 queries tests pass (live-wire included). tsc, eslint, prettier clean.

## Notes

The live fixture's code corpus is empty (the vault-only fixture has no source
files), so the live-wire test's entries array is empty on this corpus; the
assertions are deliberately shape-safe (array-ness, null truncation, `code:{path}`
identity) rather than a fixed count, so they hold whether the corpus is empty or
populated and never pin to fixture-specific data. The full walk over a populated
corpus is proven at the engine wire level in P01.S03.
