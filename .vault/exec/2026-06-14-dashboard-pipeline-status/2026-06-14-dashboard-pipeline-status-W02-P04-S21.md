---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Render the plan-level progress against the existing lifecycle.progress facet as the derivable-today fallback so the plan row's ring lights up before the full pipeline projection lands, per the staged-capability degradation

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- The plan row ring renders against the artifact `progress` field, which carries the derivable-today `lifecycle.progress` fallback, so the ring lights up before the full step-tree capability is exercised, per the staged-capability degradation.

## Outcome

Plan-level progress is honest from the first capability; no ring renders for an ADR (no steps).

## Notes

None.
