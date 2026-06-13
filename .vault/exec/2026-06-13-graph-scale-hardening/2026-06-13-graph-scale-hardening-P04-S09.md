---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S09'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Default the GUI graph query to the constellation LOD and descend to bounded slices on zoom-in

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Verified the GUI graph view already defaults to the constellation LOD: the
  sole `useGraphSlice` consumer (`Stage.tsx`) requests `granularity: "feature"`.
  The engine's P03 bounding now makes that the unbounded-safe default and enables
  bounded document descent via `filter.feature_tags`.

## Outcome

P04.S09's intent — the GUI requests the bounded constellation by default — is
already satisfied at the consumption site. No code change was made: the
`?? "document"` fallback in `engineKeys.graph` is the raw key-builder default that
mirrors the engine's wire default and is pinned by a `queries.test.ts` assertion;
flipping it would break that tested contract for no behavioral gain (Stage already
passes `"feature"` explicitly).

## Notes

DEVIATION (no-op, intent already met): rather than change the peer-owned
`src/stores` default (dashboard-layer-ownership), the LOD default was confirmed
present at `Stage.tsx`. Bounded document descent is the engine's feature-tag
filter (P03.S07) + the ego `/nodes/{id}/neighbors` query, consumed by the scene's
existing semantic-zoom LOD (`scene/field/camera.ts`).
