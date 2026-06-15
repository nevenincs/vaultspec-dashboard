---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add the CAPABILITY-served constants (PIPELINE_STATUS_SERVED, PLAN_INTERIOR_SERVED, ADR_STATUS_SERVED) signaling each not-yet-shipped wire capability so the surface renders a designed per-capability placeholder rather than a broken control, mirroring the CHANGED_FILES_LIST_SERVED constant

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the capability-served constants `PIPELINE_STATUS_SERVED`, `PLAN_INTERIOR_SERVED`, `ADR_STATUS_SERVED` mirroring `CHANGED_FILES_LIST_SERVED`, so each capability renders a designed placeholder rather than a broken control.

## Outcome

The surface degrades per-capability under staged unblock; all three are true today against the shipped wire.

## Notes

None.
