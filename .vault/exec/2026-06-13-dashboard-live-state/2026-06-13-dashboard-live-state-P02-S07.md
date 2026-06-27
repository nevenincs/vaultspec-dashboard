---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S07'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Mount the graph-sync hook and push the held slice broken-link count from the Stage

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Mounted `useGraphLiveSync(scope, timelineMode.kind === "live")` in the Stage alongside
  `useTimeTravel`, so LIVE mode is reactive and time-travel hands the scene to the
  driver.
- Added a Stage effect that pushes the broken-link count from the held merged slice (a
  pure reduction over edges with `state === "broken"`) into the live-connection slice,
  feeding the degradation matrix; it emits 0 when no slice is held, so a scope swap never
  leaves a stale count.

## Outcome

The assembled live + degradation plane is wired at the one orchestration point. The full
suite is green (336 tests), typecheck and lint clean.

## Notes

The graph stream is workspace-global (one delta clock, contract REDLINE-3), so
`streamConnected`/`lastSeq` are not scope-keyed; only `brokenLinkCount` is scope-derived
and it self-resets via the held-slice effect, honoring the wholesale-reset discipline
(findings 022/023) without an explicit slice reset in `setScope`.
