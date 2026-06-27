---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S39'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Surface a focus-change loading state from the stores layer into the scene loading channel, derived from the lens-and-focus query state

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

## Outcome

Surfaced a focus-change loading state from the stores layer via useSalienceSliceView: loading is true on both the initial fetch (isPending) and a lens/focus re-query (isFetching), so the scene shows a loading state on a focus change behind the stores->scene boundary.

## Notes
