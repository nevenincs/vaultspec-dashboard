---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---




# Read work-pillar availability in WorkTab through a stores selector hook only, never calling fetch and never reading the raw tiers block, per dashboard-layer-ownership

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Read work-pillar availability through the `useWorkPillarAvailability` stores selector only; no `fetch`, no raw `tiers` read.

## Outcome

`WorkTab` consumes interpreted truth from the stores layer, conforming to dashboard-layer-ownership.

## Notes

Added the thin `useWorkPillarAvailability` hook (plus `deriveWorkPillarAvailability`) in the stores query module as the seam the pipeline-status plan extends.
