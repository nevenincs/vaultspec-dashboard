---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Mount the app-level boundary as the last line in the app root

## Scope

- `frontend/src/main.tsx`

## Description

- Wrapped the app root (the `QueryClientProvider` + `RouterProvider` tree) in
  `ErrorBoundary region="app" variant="app"` as the last line inside `StrictMode`.
- Called `installGlobalTraps()` before render so window `error` and
  `unhandledrejection` route into the logger for the whole session.

## Outcome

A throw that escapes every region boundary now degrades to a full-screen recoverable
fallback instead of a blank white screen. Full suite green after the change.

## Notes

The boundary sits inside `StrictMode` but outside `QueryClientProvider`, so a
provider-level throw is still contained. No scaffolds left.
