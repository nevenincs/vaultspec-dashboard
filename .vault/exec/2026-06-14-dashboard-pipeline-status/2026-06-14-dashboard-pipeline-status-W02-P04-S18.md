---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Replace the WorkTab frame body with the in-flight work list shell that consumes usePipelineStatusView for the active scope and maps each artifact to a row keyed on its stable node id for object constancy

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Replaced the WorkTab frame body with the in-flight work list shell consuming `usePipelineStatusView` for the active scope, mapping each artifact to a row keyed on its stable node id for object constancy.

## Outcome

The Work surface renders the real in-flight list; plans and ADRs split into their row species.

## Notes

None.
