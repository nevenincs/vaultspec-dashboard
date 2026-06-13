---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---




# Compose the live-connection slice into the surface-states hook

## Scope

- `frontend/src/app/degradation/useDegradation.ts`

## Description

- Composed the live-connection slice into `useSurfaceStates`: it reads `streamConnected`
  and `brokenLinkCount` from the stores-owned slice and passes them as the live signals
  to `deriveInputs`, so the stream-lost and broken-link rows derive from real state.
- Left the dev-override `resolve` in place, so the degradation debug switch still forces
  any condition over the real signals.

## Outcome

The mechanism/vocabulary loop is closed: the stores hold the live signals, the
`app/degradation` hook reads them through a stores hook and maps to surfaces. Existing
degradation tests stay green; the live surfaces now move with real connection state.

## Notes

`app/degradation` reading `useLiveStatusStore` is app -> stores through a stores hook,
which `dashboard-layer-ownership` permits (chrome reads state only via stores hooks). No
upward import.
