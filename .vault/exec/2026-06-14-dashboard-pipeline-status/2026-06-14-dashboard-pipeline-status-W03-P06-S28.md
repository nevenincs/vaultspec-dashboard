---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:507879fdeec2e56f0bd9f59c6277754b722443fa5b44da0ac9aec9062e610140'
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
