---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S54'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add the minimap-as-scrubber overview ribbon

## Scope

- `frontend/src/app/timeline/Minimap.tsx`

## Description

- Add the timeline minimap as a pure SVG overview ribbon spanning the whole corpus, with the visible window drawn as a brush rectangle and the ribbon doubling as a scrubber.
- Source the corpus span from the engine-enumerated date bounds (a dumb projection of the wire) with a fixed fallback span before the vocabulary loads.
- Add pure helpers mapping corpus instants to and from ribbon x, projecting the visible window onto the ribbon as the brush, and computing the centring scroll offset; click/drag scrubs and writes only the scroll offset, and arrow keys nudge it so the ribbon is keyboard-reachable.

## Outcome

The minimap renders the corpus-spanning ribbon with a visible-window brush and scrubs the timeline by writing scroll offset. Verified by pure-helper tests for the span derivation, brush projection within bounds, and ribbon-x inversion, plus a mounted-component test asserting an arrow key nudges the store scroll offset.

## Notes

This is distinct from the stage minimap (which hosts a scene-drawn canvas and moves the camera): the timeline ribbon draws its own SVG on the token layer, owns only the horizontal scroll position, fetches nothing, and reads no raw tiers block. The minimap carries a slider role with min/max/now derived from the corpus span so it is announced as a real scrubber.
