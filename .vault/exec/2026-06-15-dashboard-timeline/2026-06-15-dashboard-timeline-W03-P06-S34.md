---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S34'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Render dated document marks with their Phosphor domain mark and tabular-numeral dates

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Switch the timeline's primary data source from the events hook to the bounded
  lineage hook `useTimelineLineage`, reading nodes and arcs from the slice.
- Position each dated node at its blob-true `created` instant via the scroll-strip
  viewport mapping (store `pxPerMs`/`scrollOffset`, origin at the visible-range
  start) and in its lane via the phase-lane `laneOf`/`laneCenterY` geometry.
- Draw each node's Phosphor domain mark via the shared `DocTypeMark` chrome
  component in `currentColor`, shape-first, with the date label tabular.
- Respect per-lane visibility (hidden lanes neither rule nor place marks).
- Virtualize marks to the visible range plus a margin and apply the
  belt-and-suspenders `capItems(nodes, MAX_TIMELINE_MARKS)` ceiling.
- Retain the event-kind lane/mark/window helpers (LANES, laneOf, eventMark,
  timeToX window-form, zoomWindow) for the W03.P07 transport, and keep the
  context-menu side-effect import owned by the concurrent menus surface.

## Outcome

Lineage nodes render as dated, lane-placed, focusable Phosphor marks; the surface
is bounded by virtualization plus the mark cap and reads no raw `tiers` block.

## Notes

The default store `scrollOffset` opens the strip at the epoch origin; docking LIVE
at the right edge is wired by the W03.P07 playhead/scroll adaptation, not here.
A concurrent agent added an event-mark context menu; its resolver module and the
retained `setWindow`/window helpers were preserved so it keeps compiling.
