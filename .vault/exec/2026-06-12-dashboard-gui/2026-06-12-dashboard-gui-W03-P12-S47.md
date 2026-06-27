---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S47'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement the design token layer, paper-warm light and dark themes, fixed tier hues and treatments, type scale, motion durations, in Tailwind CSS-first config per G7.a and G7.d

## Scope

- `frontend/src/styles.css`

## Description

- Build the token layer in `frontend/src/styles.css` as a Tailwind v4
  `@theme` block (CSS-first config, the single token carrier): paper-warm
  ground and ink scale (including the time-travel "aged paper" tint), the
  four FIXED tier hues (hue secondary to treatment per G7.d), the spent
  state palette (active/complete/archived/stale/broken/live), a compact
  type-scale addition, and the G7.5 motion band (150-250ms, organic settle
  easing).
- Dark theme from day one as a `[data-theme="dark"]` variable remap only -
  no component knows which theme it is in; a small toggle in the shell
  flips the attribute.
- The app-wide `prefers-reduced-motion` floor lands here (S48 owns the
  rest of the floor).

## Outcome

The visual language has its carrier: every future skin decision lands as
token edits, not component churn. Gates green: typecheck, eslint, vitest
(200 passed), prettier; production build passes.

## Notes

The GPU field's interim color constants (edge treatments, state colours)
mirror these token values by documented convention; the runtime
CSS-variable bridge into the scene layer rides the commissioned
visual-language pass (G7.c family delivery) where the textures change
anyway. Flagged as a known follow-up, not silent drift.
