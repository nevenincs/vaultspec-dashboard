---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Implement the typed Action and dispatch core with the middleware chain

## Scope

- `frontend/src/platform/dispatch/dispatch.ts`

## Description

- Defined the typed `Action` (`type` / `payload` / `meta`), `ActionHandler`, `Next`,
  and `Middleware` (`(action, next) => unknown`) contracts.
- Implemented the `Dispatcher`: a handler registry (`register` returns a disposer,
  `hasHandler`) and a middleware list composed right-to-left around a terminal that
  invokes the registered handler.
- The terminal throws `UnknownActionError` for an unregistered type - a typo is a loud,
  catchable failure, never a silent no-op.

## Outcome

`dispatch.ts` is the thin seam (ADR D2): not a state container, Zustand stays the store.
6 tests cover handler routing, the unknown-action throw, disposer semantics (including
re-registration), middleware ordering, short-circuit, and action transformation.

## Notes

The scene command union is the *model* for the action shape; the locked scene seam is
neither imported nor mutated. Substrate-clean: no upward imports.
