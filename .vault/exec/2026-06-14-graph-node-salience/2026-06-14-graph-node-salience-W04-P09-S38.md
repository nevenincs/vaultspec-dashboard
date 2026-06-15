---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S38'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Parameterize the useGraphSlice query by active lens, keying the query cache on lens so a lens switch is a re-query

## Scope

- `frontend/src/stores/server/queries.ts`

## Description


## Outcome

Parameterized useGraphSlice by lens + focus and folded them into engineKeys.graph, so a lens switch or focus change is a distinct cache key (a re-query), never serving a stale other-lens slice. Added useSalienceGraphSlice reading the active lens/focus from the view store.

## Notes

