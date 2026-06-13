---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---




# Install the global window.onerror and unhandledrejection traps routed to the logger

## Scope

- `frontend/src/platform/logger/globalTraps.ts`

## Description

- Implemented `installGlobalTraps(win, log)`: registers `error` and
  `unhandledrejection` listeners on the window and routes each into the logger.
- Window error events attach the live Error (or a `{ message }` fallback); promise
  rejections serialize an Error reason as the record's error and carry a non-Error
  reason as fields.
- Made the installer idempotent (module guard) and return an `uninstall()` handle
  that removes both listeners.

## Outcome

`src/platform/logger/globalTraps.ts` is the last-resort net for failures that escape
React entirely - what an ErrorBoundary structurally cannot catch. 5 happy-dom tests
cover both event types, error-vs-fields routing, post-uninstall silence, and
idempotency - all green.

## Notes

The install is wired into the app root in `P02.S05` alongside the app-level boundary,
so the trap is live for the whole session. No scaffolds left.
