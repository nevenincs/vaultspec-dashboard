---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S10'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Implement the useAction React hook face over the dispatch core

## Scope

- `frontend/src/platform/dispatch/useAction.ts`

## Description

- Implemented `useDispatch` (stable bound dispatch) and `useAction<P>(type)` (a typed
  per-type dispatcher), both over the app dispatcher.
- Implemented `useConfirmable<P>(type)`: packages arm-to-confirm as a hook returning
  `{ armed, trigger, cancel }` - first `trigger()` arms, second fires, `cancel()`
  disarms the shared guard and clears local state.

## Outcome

The React face of the seam. 4 tests (renderHook) cover typed dispatch with payload, raw
`useDispatch`, the arm-then-fire flow, and cancel proving the guard truly disarms (a
later trigger re-arms rather than firing). Typecheck and lint clean.

## Notes

`useConfirmable` is the reusable generalization of the ops rail's two-click guard; the
chrome team can drop its hand-rolled `confirming` state in favor of it. `cancel` calls
`appConfirmGuard.disarm(type)` to keep local and guard state in sync.
