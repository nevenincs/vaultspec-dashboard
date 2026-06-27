---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S69'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add render and integration tests for the Timeline mounted in the AppShell

## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx`

## Description

- Add render/integration tests mounting the AppShell timeline composition
  (`TimelineControls` + `Timeline` with `onNodeClick={handleNodeClick}` +
  `RangeSelect`/`Playhead` overlay) through the real stores client transport
  (mockEngine over the live `/graph/lineage` wire shape).
- Assert the control bar renders, the six-lane scaffold draws, and the dated marks
  resolve.
- Assert a mark click flows into the ONE shared `Selection` (`kind: node`,
  `doc:` id) plus a BOUNDED stage ego pulse (captured via a double scene).

## Outcome

Two integration tests under the "Timeline mounted in the AppShell composition
(S69)" describe in `Timeline.render.test.tsx` cover render-together and the
mark-click selection + bounded pulse. Suite green: 12 files / 129 tests pass.

## Notes

The composition tests route the pulse to a capturing `SceneController` double so
the bounded `node_ids` cross-highlight is observed deterministically without a
mounted Pixi renderer.
