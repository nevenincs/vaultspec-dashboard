---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---




# thread the status fields through the live adapter and the scene-mapping seam

## Scope

- `frontend/src/scene/sceneMapping.ts`

## Description

- Add a pure `nodeStatusFromWire(value, cls)` helper to the scene's status util that builds the resolved status, dropping a class outside the closed treatment vocabulary and deriving the ordinal magnitude from the raw value (tier `L1..L4` to 1..4, severity `low|medium|high|critical` to 1..4, else undefined).
- Thread `status_value`/`status_class` through the sole wire-to-scene seam by calling that helper, so the scene node carries the resolved `status` object.

## Outcome

The wire status fields now reach the scene node as a resolved `{ value, class, ordinal }` object, with the ordinal derivation living in the scene's pure util rather than any view component, honoring the layer-ownership boundary. The live adapter required no change: the additive fields ride through `adaptGraphSlice` on the spread-through node body untouched.

## Notes

The derivation deliberately returns `undefined` when both fields are absent so the seam field is omitted entirely rather than carrying a malformed status; an out-of-vocabulary class keeps the raw value but drops the class, and `stampFor` renders that blank.
