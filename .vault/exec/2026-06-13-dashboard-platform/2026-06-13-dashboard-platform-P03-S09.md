---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S09'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---




# Implement the logging, tracing, and arm-to-confirm guard middlewares

## Scope

- `frontend/src/platform/dispatch/middleware.ts`

## Description

- Implemented `loggingMiddleware`: logs every dispatched action at debug and logs +
  re-throws a handler failure (observable, never swallowed).
- Implemented `traceMiddleware`: stamps a monotonic trace id and timestamp into
  `meta` so a log line correlates to its dispatch.
- Implemented `createConfirmGuard`: arm-to-confirm generalized from the ops rail - an
  action with `meta.guard === "confirm"` arms on first dispatch (returns an
  `ArmedResult`, effect withheld) and fires on the second; exposes `isArmed`, `disarm`,
  and `reset`.
- Wired `createAppDispatcher` / the `appDispatcher` singleton with trace -> log ->
  guard, and exported the shared `appConfirmGuard`.

## Outcome

8 tests cover action logging, log-and-rethrow on failure, monotonic trace ids, the
two-step guard (arm then fire), guarded-vs-unguarded passthrough, reset, and the wired
app dispatcher. Typecheck and lint clean.

## Notes

Middleware order is trace (outermost, stamps meta) -> logging (logs the traced action,
catches handler throws) -> guard (innermost, short-circuits before the effect). Added
`disarm(type)` so the hook-level cancel does not desync from the guard's armed set.
