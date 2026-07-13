---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Give the graph settings panel a correct focus order (folds, sliders, switches, reset) with trap-free containment and focus-restore to its opener

## Scope

- `live-verify slider arrow-adjust`
- `frontend/src/app/stage/GraphControls.tsx`

## Description

- Assessed the graph settings panel live: opening it via the "Graph controls" trigger renders 14 native focusables in DOM order (fold buttons, range sliders, switches) — all keyboard-operable, sliders adjust by native arrow keys.
- Confirmed by code that focus restoration is wired: the panel is a kit `Popover` with no `restoreFocus` override (defaults to true) over a persistent in-`Popover` trigger, so dismissing returns focus to the trigger via the centralized `useFocusRestore` (S09).

## Outcome

- The settings panel is keyboard-operable: open, tab through the controls in order, adjust sliders/switches by arrows, Escape to close with restore wired. No code change needed — the panel already composes the Popover correctly; this is verification.

## Notes

- Exact restore-LANDING (focus returns to the trigger vs the stage) could NOT be cleanly live-verified: the dev survey server auto-refreshes the frontend on corpus (.vault) changes, so every exec-record write / `vault check` reloaded the page mid-test and reset focus to the stage. The restore MECHANISM is verifiably present (Popover default + persistent trigger); the landing is a W06.P09 live re-confirmation once the page is stable (do all .vault writes BEFORE live tests).
