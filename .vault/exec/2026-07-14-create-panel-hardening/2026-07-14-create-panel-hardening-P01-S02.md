---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S02'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Contain the combobox listbox on short viewports (portal or space-aware max-height), raise option rows to the touch floor, and render aria-controls only when the listbox exists

## Scope

- `frontend/src/app/viewer/AutocompleteCombobox.tsx`

## Description

- Portal the suggestion listbox to the body with fixed positioning (the context-menu host idiom) so no dialog body or scroll container can clip it.
- Make placement space-aware: measured room below the field caps the max height (16rem ceiling, ~3-row floor), flipping above when below-space is too tight; re-placed on resize and captured ancestor scroll.
- Swallow mousedown on the listbox so a scrollbar drag never blurs the input and dismisses the list.
- Raise option rows to the 2.75rem touch floor on coarse pointers (shared pointer-coarse hook).
- Set aria-controls only while the listbox is rendered.

## Outcome

Closes combobox-dropdown-clipped (MEDIUM), the combobox third of touch-target-subminimum, and combobox-aria-controls-dangling (LOW) for every consumer at once. tsc clean; all combobox consumer suites green unchanged.

## Notes

The portaled list keeps the existing blur/commit semantics: option mousedown still commits via preventDefault, and container-blur still closes the list on tab-away.
