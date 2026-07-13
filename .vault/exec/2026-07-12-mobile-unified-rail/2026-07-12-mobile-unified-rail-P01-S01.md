---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Cut the compact surface union to Home and Timeline plus the momentary Search, renaming the browse pane to home and updating the default, reset, and pane helpers

## Scope

- `frontend/src/stores/view/compactSurface.ts`

## Description

- Replace the compact surface union with `home`, `timeline`, and the momentary `search`; drop the retired `browse` and `status` pane ids.
- Point the store default and the reset target at the unified `home` pane.
- Keep the primitive-returning selector hook and the standalone setter/reset (stable-selector law) unchanged in shape.

## Outcome

The compact shell now rests on one `home` pane plus `timeline`; the former Browse and Status panes no longer exist as standing surfaces. Typecheck, eslint, and prettier clean.

## Notes
