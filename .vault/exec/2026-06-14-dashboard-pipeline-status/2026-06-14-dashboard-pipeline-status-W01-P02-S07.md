---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the engineKeys.planInterior cache key (plan node id) and the usePlanInterior query hook that calls engineClient.planInterior, disabled until a plan row is expanded, following the useNodeNeighbors enabled-on-id pattern

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added `engineKeys.planInterior(id)` and the `usePlanInterior` hook calling `engineClient.planInterior`, disabled until a plan row is expanded (the `useNodeNeighbors` enabled-on-id pattern).

## Outcome

The interior is fetched lazily, only for an expanded plan node, honoring graph-queries-are-bounded-by-default.

## Notes

None.
