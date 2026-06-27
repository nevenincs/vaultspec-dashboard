---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S26'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Extend useTimelineStore with per-lane visibility view state

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Extend `useTimelineStore` with per-lane visibility view state: a `laneVisibility` map keyed by the six phase lanes plus a `toggleLane(lane, visible?)` action.
- Export `PHASE_LANES` (the `research|adr|plan|exec|review|codify` lanes) and a `PhaseLane` type as the single source the visibility map and the W03 renderer key off.
- Default every lane visible; `toggleLane` flips a lane or sets it idempotently when `visible` is given.

## Outcome

The store carries the lane-visibility state the W04 control bar's lane toggles drive and W03 renders only the visible lanes from. The lane set mirrors the lineage wire's `LineagePhase` lanes.

## Notes

None.
