---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Extend useTimelineStore with hovered-node view state

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Extend `useTimelineStore` with hovered-node view state: a `hoveredNodeId` (the stable lineage node id, or null) plus a `setHoveredNode` setter.
- Document that identity rides the engine stable node id, never a client-minted key, and that W03 drives the ego-highlight + dim-the-rest interaction off this field.

## Outcome

The store carries the hover primitive W03's ego-highlight consumes. With S25/S26, the timeline view state (scroll/scale, lane visibility, hover) is complete for W03, leaving `window`/`playheadT` intact for W03 to adapt.

## Notes

None.
