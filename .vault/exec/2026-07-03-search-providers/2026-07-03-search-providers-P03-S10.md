---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S10'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Cover the host with unit vectors (band ordering, dedupe best-rank, provider-absent degradation, epoch merge) and one live-wire settled-search case

## Scope

- `frontend/src/stores/server/searchProviders.test.ts`

## Description

- Extract the pure `mergeSearchProviders(providers)` from the host's `useMemo`
  so the merge/dedupe/band/epoch collapse is unit-testable without a render; the
  host now delegates to it (semantic provider passed first).
- Add `searchProviders.test.ts` pure vectors: band interleaving by score,
  best-rank identity dedupe, the semantic-outage non-event (files carry the set),
  the honest degraded-when-empty phase, error only when semantic failed and
  nothing served, the epoch collapse (number > null > undefined), the 40-item
  bound, all-idle, and retry fan-out. Plus a `literalBand` threshold vector.
- Add one live-wire case: render `useSearchProviders` against the real engine and
  assert it settles into a terminal phase, never errors, holds the 40-bound, and
  yields navigable species-tagged entries.

## Outcome

11 tests green (10 pure + 1 live). Full frontend gate green (`just dev lint
frontend`, 0 errors). The host's ranking, dedupe, degradation collapse, epoch
share, and bound are now pinned by spec-derived vectors, and the end-to-end wiring
is proven against the real `/search` + `/vault-tree` + `/code-files` surfaces.

## Notes

Scope reached lightly into `searchProviders.ts` (nominally S07-S09's file) to
extract `mergeSearchProviders` as a pure function — required to make the ADR's
named vectors (band ordering, dedupe, degradation, epoch) testable without a
render, which is the step's explicit intent. The live case needs the
`happy-dom` environment directive (renderHook needs a DOM); the pure vectors run
in the default node environment within the same file.
