---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S22'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement hover ego-highlight with field recede and DOI label culling per G3.b

## Scope

- `frontend/src/scene/field/egoHighlight.ts`

## Description

- Add `frontend/src/scene/field/egoHighlight.ts`: pure `computeEgo` (the
  hovered node, its 1-hop neighbors, and incident edges from the scene
  graph model's incidence index) plus the recede constant - dim, never
  hide.
- Extend the sprite layer with `setHighlight`: lifted nodes keep full
  alpha and show their labels at any zoom (DOI label culling rides the
  lift); the rest of the field recedes via an alpha multiplier composed
  with the freshness halo. LOD plus highlight now apply through one
  `refresh` pass.
- Extend the edge layer with `setHighlight`: lifted edges rebuild into
  `+lift` groups at full treatment, non-lifted groups recede. Group keys
  now carry a base/lift split throughout.
- Wire hover events from the gesture machine to the ego application inside
  the field assembly, before the event crosses the seam.
- Add `frontend/src/scene/field/egoHighlight.test.ts` for the ego
  computation and the recede invariant.

## Outcome

Hover lifts the neighborhood and recedes the field per G3.b. Gates green:
typecheck, eslint, vitest (118 passed), prettier.

## Notes

Edge highlight rebuilds topology per hover transition - fine at
DOI-bounded constellation sizes; revisit only if ego hover on dense
descents shows jank.

