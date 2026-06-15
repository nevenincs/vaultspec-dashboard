---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S33'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Emit node selection intent on activating an ADR row, calling selectNode with the ADR's stable node id

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Emitted node selection intent on activating an ADR row, calling `selectNode` with the ADR stable node id.

## Outcome

Activating an ADR row selects the ADR node through the same seam.

## Notes

None.
