---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S48'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement reduced-motion support and full keyboard operability, arrow-walk the graph and bracket-step the playhead, per G7.d

## Scope

- `frontend/src/app/a11y`

## Description

- Add `frontend/src/app/a11y/KeyboardNav.tsx`: full keyboard operability
  of stage and timeline through the same shared primitives the pointer
  uses - left/right arrow-walks the selection's neighbors, up/down cycles
  the feature constellation (engine vocabulary), and bracket keys step the
  playhead (2% of the window, one-minute floor; stepping back from LIVE
  enters time travel, stepping past now docks back to LIVE). Form fields
  and modifier combos keep their keys.
- Reduced motion honored end-to-end: the S47 CSS floor covers the DOM, and
  the GPU field's fade band collapses to imperceptible when
  prefers-reduced-motion is set (visibility trackers constructed with a
  1ms duration).
- Pure, tested helpers: `cycle` (wraparound walk), `bracketStep`,
  `steppedPlayhead` (clamps, LIVE transitions both ways).

## Outcome

The G7.d floor is in: keyboard-only operation of selection, constellation
navigation, and the playhead; motion respects the OS preference in both
the DOM and the field. Gates green: typecheck, eslint, vitest (205
passed), prettier; production build passes.

## Notes

Grayscale-safe tier legibility and WCAG AA contrast are design-time
properties already carried by the treatment-primary encoding (S11) and
the token palette (S47); the formal contrast audit rides the
visual-language review with the commissioned family.
