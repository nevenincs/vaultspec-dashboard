---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S47'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the default node state render faithful to the binding Node-items frame

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Add a faithful DEFAULT-state body rim to the category-circle node: the binding `graph/Node-items` default disc reads as a solid category fill carrying a faint, slightly darker hairline at its edge, which gives the disc weight on the connection-field ground and separates it from a same-category neighbour.
- Introduce a pure `darkenColor` per-channel darken helper (clamped), and `bodyRimColor` which derives the rim as an IN-FAMILY darkened shade of the body's OWN resolved hue, so the rim tracks the theme and the ghost desaturation with no second accent and no borrowed neutral (warmth lives in one hue, not decoration).
- Draw the rim in the body-sync pass alongside the fill, with inner alignment so it never inflates the hit/island radius; redrawn only on the existing radius/colour-change path, so it stays off the per-frame position hot path.
- Cover the new helpers in `nodeSprites.test.ts`: the darken clamps and goes pure-black at 1, and the rim is strictly the same hue darkened (never the fill, never brighter).

## Outcome

DEFAULT node state is faithful to the binding Node-items frame: a crisp full-opacity category circle with an in-family hairline edge, preserved across the selected and ego-recede states. Scoped scene tests green (`nodeSprites.test.ts`, `nodeSprites.draw.test.tsx`).

## Notes

The rim is present in every state (a property of the circle, not a default-only overlay), so the disc keeps its edge under the selection ring and the ego recede; it follows the body colour, so a ghosted node's rim desaturates with its fill. Scope touched `nodeSprites.ts` (plus its test) only; no SceneController surface change.
