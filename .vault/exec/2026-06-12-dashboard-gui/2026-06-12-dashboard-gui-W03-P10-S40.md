---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S40'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# build the now strip showing git, core in-flight, and rag rollup from the status snapshot plus SSE backends and git channels

## Scope

- `frontend/src/app/right/NowStrip.tsx`

## Description

- Add `frontend/src/app/right/NowStrip.tsx`: three cards - git (branch,
  ahead/behind drift, dirty count), core (reachability + vault health),
  rag (service/watcher/index/jobs rollup) - from the /status recovery
  snapshot; the backends and git SSE channels invalidate the snapshot on
  transitions (stream is delta, /status is recovery per contract §7).
- Card rollups are pure, tested functions (`gitCard`/`coreCard`/`ragCard`)
  with honest degraded tones: stopped/crashed/absent render as designed
  down states, never as errors; engine-unreachable keeps its actionable
  message.
- The activity rail now mounts the strip (with ops panel and inspector)
  replacing the foundation scaffold.

## Outcome

"What is happening" is live in the rail and refreshes on stream
transitions. Gates green: typecheck, eslint, vitest (184 passed),
prettier.

## Notes

The degraded-state illustrations (G7.4) ride the S46/S47 passes; tones
and wording carry honesty until then.
