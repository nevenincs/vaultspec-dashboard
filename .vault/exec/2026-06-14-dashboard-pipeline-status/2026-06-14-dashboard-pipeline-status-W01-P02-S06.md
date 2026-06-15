---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the engineKeys.pipelineStatus cache key folding (scope, as-of) and the usePipelineStatus query hook that calls engineClient.pipelineStatus, disabled when scope is null, following the useGraphSlice pattern

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added `engineKeys.pipeline(scope, asOf)` folding scope plus as-of, and the `usePipelineStatus` query hook calling `engineClient.pipeline`, disabled when scope is null (the `useGraphSlice` pattern).

## Outcome

The in-flight projection is consumable as a TanStack query keyed by the cacheability unit.

## Notes

None.
