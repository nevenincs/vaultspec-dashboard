---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S20'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# wire TanStack Query hooks with streamedQuery SSE consumption and cache keys of scope, filter, as-of per G5.b and the stateless-scope contract guarantee

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add `frontend/src/stores/server/queries.ts`: the query-key factory and
  read hooks for every contract family the GUI consumes (map, vault-tree,
  filters vocabulary, graph slice, node detail/neighbors/evidence, events,
  search).
- Key graph reads by the (scope, filter, as-of) triple per the
  stateless-scope contract guarantee - `stableKey` gives order-insensitive
  filter serialization so equal filters share cache entries; live reads key
  as "live".
- Wire SSE consumption through v5's `streamedQuery` (append mode) over a
  pure incremental `text/event-stream` parser (`parseSseFrames`) and an
  async-generator Response consumer (`sseChunks`), all flowing through the
  same client transport - the mock engine's SSE serves it today, the live
  origin serves it after S49. Added `EngineClient.openStream` for this.
- Hooks gate on null scope/id (`enabled`) so region components render
  before a scope is picked without firing requests.
- Add `frontend/src/stores/server/queries.test.ts`: stable-key semantics,
  triple keying, frame parsing with partial-buffer remainder, replayed
  graph deltas in seq order from `since=`, and channel-filtered live
  pushes.

## Outcome

Server state has its complete shape: every read cached by the contract's
cacheability unit, streams consumed idiomatically, all against the mock.
Phase W02.P05 - the cross-plan fence - is complete. Gates green: typecheck,
eslint, vitest (111 passed), prettier; production build passes.

## Notes

`streamedQuery` is the v5 experimental export (`experimental_streamedQuery`),
matching the audit-verified 5.101 install; revisit the alias when it
stabilizes. Targeted cache invalidation from stream chunks (fs/git/backends
driving `invalidateQueries`) lands with the consumers in W02.P06/W03.P10.

