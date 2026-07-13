---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Implement the ErrorBoundary class with app and region variants, reset, and the logger hook

## Scope

- `frontend/src/platform/errors/ErrorBoundary.tsx`

## Description

- Implemented the `ErrorBoundary` class (the substrate's one class component) using
  `getDerivedStateFromError` and `componentDidCatch`.
- `componentDidCatch` logs through `logger.child("boundary")` plus a debug record
  carrying the React component stack, then calls the optional `onError` hook.
- Added a `variant` prop ("app" full-screen last line, "region" contained card) and a
  `fallback` override; `reset()` clears the boundary so children re-mount on retry.
- Authored `DefaultFallback`: the app variant is a full-screen recoverable message; the
  region variant is a compact amber card in the degradation palette; the raw error
  message renders only in development.

## Outcome

6 tests cover healthy passthrough, region containment plus logging, the app fallback, a
custom fallback, retry recovery, and sibling isolation (a thrown stage does not take
down the rail). `children` was made optional to satisfy `createElement` variadic-child
typing across the test suite.

## Notes

Mechanism only (ADR D1/D4): the boundary catches *unexpected* throws; expected
degradations stay with the app degradation matrix. No scaffolds left.
