---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S08'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Author the compact render suite (viewport-class driven): footer reachability with constrained height, listbox containment, touch-target floors, and the 320-width presentation

## Scope

- `frontend/src/app/left/CreateDocDialog.compact.render.test.tsx`

## Description

- Author the compact render suite with the shell's stubbed compact + coarse-pointer media queries (the CompactUnifiedRail idiom): the primary action pinned outside the one scrolling body with the safe-area inset (soft-keyboard reachability), the viewport width clamp (narrow centered modal per the design ruling, no sheet chrome), the portaled fixed-position suggestion listbox (clip-proof), and the 2.75rem floors on the back and chip-remove affordances.

## Outcome

4 compact tests green; the structural contract of the approved compact frame is locked.

## Notes

happy-dom has no layout, so the suite asserts the structural contract (containment, classes, portal target), not pixels; the space-aware placement math is locked in the combobox primitive suite.
