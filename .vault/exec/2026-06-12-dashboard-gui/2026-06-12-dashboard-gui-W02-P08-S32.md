---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S32'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the timeline lanes with engine-bucketed density rendering resolving to event marks at fine zoom per G4.a

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Add `frontend/src/app/timeline/Timeline.tsx`: the bottom-docked movie
  idiom surface with three fixed lanes (commits, document events, vault
  lifecycle) - heterogeneity rides per-event glyphs, never extra lanes.
- Zoom = aggregation per G4.a: span maps to the events query's bucket
  (engine-side density at 1d/1h; raw marks only under the 3-day threshold)
  so the timeline never renders ten thousand individual marks; buckets
  draw as density bars per lane and kind.
- Wheel zoom anchored under the cursor with span clamps and a never-past-
  now bound; pure, tested window math (timeToX/xToTime/zoomWindow).
- Add the timeline view store (window + playhead position, LIVE default)
  that S33-S35 drive; the surface accepts an event-click handler (S36) and
  an overlay slot (S33 playhead, S35 range) so later steps dock in without
  reshaping this component.
- Replace the AppShell's footer scaffold with the live timeline.
- Add `frontend/src/app/timeline/Timeline.test.ts` covering lanes, glyph
  heterogeneity, bucket thresholds, projection round-trips, anchored zoom,
  and span clamps.

## Outcome

The time axis renders against the mock corpus with density honest to zoom
level. Gates green: typecheck, eslint, vitest (158 passed), prettier.

## Notes

This step landed after the P05 mock revision gate opened (re-check PASS);
the lanes read the revised event/bucket serving directly.

P08 visual review observation 2, answered: bucket magnitude encoding IS
implemented - bar height is 3px plus 3px per count, capped at the lane
height - and the uniform appearance in the boundary screenshot reflects
the fixture corpus's genuinely uniform daily counts (mostly one event per
bucket per kind), not a missing channel. Also folded in the consolidated
revision per finding timeline-raw-cap-020: a client-side raw-mark ceiling
(500) backs the engine's bucketing guarantee belt-and-suspenders.

