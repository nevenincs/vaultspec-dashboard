---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-06-22'
step_id: 'S16'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Enroll the graph nav controls (zoom/fit/reset toolbar) onto FocusZone horizontal roving as one tab stop

## Scope

- `live-verify`
- `frontend/src/app/stage/GraphControls.tsx`

## Description

- Made the kit `IconButton` `forwardRef` (backward-compatible; existing consumers pass no ref) so a roving toolbar can move focus to it — the kit enabler for this and future toolbar enrollments.
- Enrolled the graph nav controls (zoom in/out · fit · reset) onto `useFocusZone` (orientation "both"): the cluster is now `role="toolbar"` and one tab stop; arrows rove between the four buttons, each syncing the roving key via onFocus.

## Outcome

- Live-verified: the toolbar reports tabindexes [0,-1,-1,-1] (one tab stop) and ArrowDown roves zoom-in → zoom-out within the toolbar. tsc/eslint/prettier clean; IconButton + GraphControls tests (12) green.

## Notes

- The `IconButton` forwardRef pre-does part of the W06.P10 kit sweep; every IconButton-based toolbar can now adopt FocusZone roving.
- Editing the widely-imported `IconButton` triggered a transient HMR partial-swap crash ("Component is not a function") that a full reload cleared — an HMR artifact, not a code defect (tsc/tests green; clean reload renders fine).
