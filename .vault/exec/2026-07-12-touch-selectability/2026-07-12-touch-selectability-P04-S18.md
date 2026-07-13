---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S18'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Add the coarse-pointer per-row menu disclosure affordance over the openContextMenu seam for menu-bearing rows

## Scope

- `frontend/src/app/chrome/RowMenuDisclosure.tsx`

## Description

- Author `RowMenuDisclosure` in `frontend/src/app/chrome/RowMenuDisclosure.tsx`: a coarse-pointer-only kit `IconButton` that opens the row's resolver menu through the existing `openContextMenu` seam, anchored at the control
- Author `usePointerCoarse`, a `matchMedia`-backed primitive-snapshot signal mirroring the `viewportClass` store pattern

## Outcome

The deliberate touch entry to the menu plane exists as one shared chrome control; it renders nothing on fine-pointer devices and is exempt from the selection guard because a tap on it is always an explicit menu request. Mounting on compact surfaces lands in the next step.

## Notes
