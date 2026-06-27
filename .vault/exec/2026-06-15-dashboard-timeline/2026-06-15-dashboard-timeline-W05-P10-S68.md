---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S68'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Wire the rebuilt Timeline into the AppShell layout

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Verify the AppShell bottom-region wiring of the rebuilt relational timeline.
- Confirm `Timeline` mounts with `onNodeClick={handleNodeClick}` and the
  `RangeSelect` + `Playhead` overlay, and `TimelineControls` docks at the top edge.
- Confirm the mark-click contract: `Timeline` invokes `onNodeClick(node, arcs)`
  with the visible-slice arcs, and `handleNodeClick(node, arcs, scene)` derives the
  bounded 1-hop ego pulse from them (scene defaults to `getScene().controller`).

## Outcome

Wiring is correct as-is (a concurrent integration agent had already landed it,
referencing the deferred S45 node-click wiring). No change needed: the layer law
holds (region reads stores hooks + emits shared-selection intent only, no fetch,
no raw `tiers`), and the `onNodeClick(node, arcs)` signature matches
`handleNodeClick`'s bounded-join derivation.

## Notes

S68 was pre-wired by the concurrent integration campaign; this step verified
rather than authored it. `tsc -b` is clean across the project with the wiring in
place.
