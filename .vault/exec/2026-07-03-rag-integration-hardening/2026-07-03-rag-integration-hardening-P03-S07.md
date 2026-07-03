---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S07'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Raise the client search budget strictly above the engine search budget plus transport margin and send the app-chosen max_results in the search body so the wire payload is app-bounded

## Scope

- `frontend/src/stores/server/queries.ts + engine.ts`

## Description

- Raised `SEARCH_QUERY_TIMEOUT_MS` in `queries.ts` from 5s to 12s and documented the ADR D2 ordering invariant: the client abort budget must stay strictly greater than the engine's `SEARCH_HTTP_BUDGET` (10s) plus transport margin, so every search outcome arrives as a tiers-carrying envelope before the client can abort. Under this ordering a client abort now honestly means only engine-unreachable.
- Added the exported `SEARCH_MAX_RESULTS` constant (40) to `queries.ts`, sized to the unified palette's merged-view bound so the top-N merge stays correct when one corpus dominates, sitting below the engine's `MAX_SEARCH_RESULTS` ceiling of 50. Documented that it is fixed and stays out of the query key.
- Threaded `max_results: SEARCH_MAX_RESULTS` into the `engineClient.search` call inside `useEngineSearch`.
- Extended the `EngineClient.search` body type in `engine.ts` with the optional `max_results` field mapping to rag's `top_k`.

## Outcome

The `POST /search` body is now app-bounded and the client budget strictly outlives the engine budget. `tsc -b` clean. The query key contract is unchanged: `max_results` is a fixed constant, so it is not part of the key.

## Notes

- The budget-ordering assertion and the guard test pinning `SEARCH_MAX_RESULTS` equal to `UNIFIED_SEARCH_RESULTS_MAX_ITEMS` are authored in S10 with the rest of the frontend search test updates.
