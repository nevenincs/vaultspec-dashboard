---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S28'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the expand/collapse affordance to the plan row that toggles the plan-container interior, lazily enabling usePlanInterior for the expanded plan node only

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Added the expand/collapse affordance to the plan row toggling the interior, lazily enabling `usePlanInteriorView` for the expanded plan node only via the expanded-set keyed on stable node id.

## Outcome

Expanding a plan fetches its bounded interior on demand; collapsed plans issue no interior query.

## Notes

None.
