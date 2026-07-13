---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the client method that fetches the lineage slice for a scope, range, and filter

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `lineage({ scope, from?, to?, filter? })` client method on `EngineClient`, issuing `GET /graph/lineage` with the same get/unwrap path as `events` and `graphQuery`.
- Pass `from`/`to` as inclusive ISO `yyyy-mm-dd` bounds and `filter` as the URL-encoded JSON filter string the route accepts.
- Run the result through the tolerant `adaptLineageSlice` adapter, mirroring how `graphQuery` runs through `adaptGraphSlice`.

## Outcome

The stores layer is now the sole wire client for the lineage projection. The method returns the reconciled `LineageSlice`; absent params are simply omitted from the query string by the shared `get` builder.

## Notes

The non-null assertion on `scope` matches the surrounding client style; the hook gates `enabled` on a non-null scope so the call only fires with a real scope.
