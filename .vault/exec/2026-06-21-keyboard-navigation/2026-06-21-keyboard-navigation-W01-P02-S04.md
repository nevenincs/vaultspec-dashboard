---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
step_id: 'S04'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Register F6 / Shift+F6 region-cycle as global Class-A keybindings in the keymap registry and wire the dispatcher action to advance/reverse focus to the next visible region

## Scope

- `frontend/src/app/chrome/regionCycleKeybindings.ts`

## Description

- Registered F6 (next) and Shift+F6 (previous) as global Class-A keybindings through the one keymap registry, with action resolvers whose `run` calls `cycleFocusRegion(+/-1)` — no private window listener.
- Mounted a focusin tracker (capture phase) that feeds per-region entry memory, with full disposer cleanup on unmount.

## Outcome

- Live-verified: F6 advances and Shift+F6 reverses through every visible region with wrap, fired by the existing global dispatcher. prettier/eslint/tsc clean.

## Notes

- Honors `keyboard-shortcuts-bind-through-the-one-keymap-registry`: region cycling is a command, so it binds in the registry (rebindable, legend-derived), while the within-region arrow nav stays Class-B in `useFocusZone`.
- Known minor limitation: the dispatcher's text-entry gate suppresses unmodified named keys (incl. F6) while focus is in an input; acceptable since the filter-trap remediation (P03) stops users being stranded in a field.
