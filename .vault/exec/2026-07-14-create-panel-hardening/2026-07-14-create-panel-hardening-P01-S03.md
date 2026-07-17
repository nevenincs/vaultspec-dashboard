---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S03'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Update or add primitive render tests for the footer slot, reduced-motion gate, and listbox containment, and re-run every existing Dialog and combobox consumer suite green

## Scope

- `frontend/src/app/chrome and consumer test suites`

## Description

- Extend the Dialog primitive render tests: the footer slot renders OUTSIDE the one scrolling body with the safe-area inset (and absent when unused), and both animated layers carry the motion-reduce gate.
- Author the combobox floating-listbox suite: portal + fixed placement, space-capped height on a short viewport, flip-above when below-space is tight, aria-controls only-when-rendered, and the coarse-pointer option floor (stubbed rects and media queries; the assertions target the placement contract, not pixels).
- Re-run every Dialog/combobox consumer suite.

## Outcome

15 primitive tests green (10 Dialog + 5 combobox); consumer sweep 242 tests green across 39 files (chrome 82, viewer/settings/left 160); whole-frontend tsc exit 0.

## Notes

None.
