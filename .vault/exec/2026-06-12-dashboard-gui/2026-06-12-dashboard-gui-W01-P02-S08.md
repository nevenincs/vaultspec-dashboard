---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement the client-side position cache and warm-start persistence keyed by workspace and scope per G5.d and G3.e

## Scope

- `frontend/src/scene/positionCache.ts`

## Description

- Add `frontend/src/scene/positionCache.ts`: `PositionCache` persisting node
  positions per workspace + scope blob, keyed by the contract's stable node
  ids so a cached map survives re-querying, filtering, and time travel.
- Inject the storage backend (`KeyValueStore` subset of Web Storage;
  `defaultPositionCache()` binds `localStorage` in the browser, tests use a
  Map-backed store) - the engine holds no preference store per G5.d.
- Make persistence best-effort and self-healing: versioned blobs, corrupt
  blobs read as cache misses and are cleared, coordinates rounded to 0.1
  scene units, non-finite coordinates dropped on load, LRU eviction beyond
  12 scopes per workspace and on quota-rejected writes.
- Add `frontend/src/scene/positionCache.test.ts` covering round-trip with
  workspace/scope isolation, corrupt-blob self-healing, single-scope clear,
  LRU limit eviction, quota-pressure eviction-and-retry, and non-finite
  coordinate filtering.

## Outcome

Warm-start layout has its persistence: the FA2 worker (W01.P03.S13) seeds
from `load` and the field saves back on settle, restoring the remembered
map across sessions per G3.e mental-map preservation. Gates green:
typecheck, eslint, vitest (38 passed), prettier.

## Notes

localStorage over IndexedDB, deliberately: blobs are small (10k nodes round
to ~200kB), access is synchronous at mount time (no async gap before the
first layout tick), and the ADR names either as acceptable. If a corpus
ever overflows quota, the eviction path degrades to cold-start - a slower
settle, never an error.
