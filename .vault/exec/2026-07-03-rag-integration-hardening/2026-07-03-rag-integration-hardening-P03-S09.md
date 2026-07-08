---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S09'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Surface semantic_epoch and index_state through the interpreted search selector so consumers key caches and render staleness from served truth, keeping a client-side abort mapped to the transport-error state

## Scope

- `frontend/src/stores/server/searchController.ts`

## Description

- Added `indexState` and `semanticEpoch` as raw served fields on `SearchControllerView`, forwarded from the held `SearchResponse` unchanged — the `index_state` reference is passed through, never cloned, so identity stays stable across renders (frontend-store-selectors: no fresh reference minted in a selector); the epoch is a primitive carrying its three distinct truths (number / null / undefined, never collapsed).
- Extended the `interpretSearch` input `data` type with optional `index_state` and `semantic_epoch`, computed the two raw values once, and threaded them through all five branches (idle reports neither; semantic-offline, error, loading, and results/no-results forward the served values).
- Added `semanticEpoch` to `UnifiedSearchView` and a `mergeSemanticEpoch` helper: both corpora share the engine's short-TTL epoch cache, so the merge prefers a concrete number, then the honest `null`, then `undefined`. Per-corpus `index_state` detail stays on the single-target controllers (distinct corpora), not fabricated into one merged block.
- Verified `isTransportError` still classifies a client-side `AbortError` (not an `EngineError`) as transport — with the new S07 budget ordering that error state is now honest (a client abort means engine-unreachable). No behavioral change needed.
- Added no new corpus filter and no new fetch.

## Outcome

The interpreted search selector now exposes served freshness as raw fields for presentation-only mapping downstream, and the unified palette view carries the shared epoch for cross-plane cache-keying. `tsc -b` clean on the touched files.

## Notes

- The freshness-field selector tests land in S10.
- Pre-existing, unrelated: `frontend/src/app/right/RagOpsConsole.tsx` carries stranded working-tree WIP (a Figma console rewrite) passing `className` to the kit `Button`; five `tsc` errors already present before this phase, outside P03 scope and not touched here.
