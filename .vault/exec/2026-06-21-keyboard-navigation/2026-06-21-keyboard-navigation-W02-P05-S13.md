---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-06-22'
step_id: 'S13'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Confirm the browser-mode toggle (Vault/Files SegmentedToggle) composes FocusZone roving radiogroup semantics

## Scope

- `frontend/src/app/kit/Segment.tsx`

## Description

- Live-verified the browser-mode toggle (Vault/Files) already roves correctly as one tab stop: ArrowRight switched Vault to Files with roving tabindex 0/-1, Tab exits the group.
- Found and fixed its only defect — the kit `Segment` arrow handler `preventDefault`ed but did not `stopPropagation`, so each arrow double-fired the global graph-nav binding (switching the segment AND moving the graph selection). Added `stopPropagation` to isolate the Class-B widget key from the Class-A window dispatcher.

## Outcome

- The browser toggle is enrolled: one tab stop, arrows switch, no double-fire. Segment/SegmentedToggle tests (5) green; prettier/eslint/tsc clean. The fix lands in the shared kit `Segment`, so every `SegmentedToggle` consumer inherits it (pre-doing part of the W06.P10 kit sweep).

## Notes

- The toggle's keyboard model is the kit `SegmentedToggle`/`Segment` roving (not yet converged onto `useFocusZone`); the full convergence is the W06.P10 kit-primitives sweep. This step's deliverable (works as one tab stop, arrows switch, no double-fire) is met.
