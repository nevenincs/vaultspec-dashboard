---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S34'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# drive scene set-time from the playhead via asof keyframes and client diff-log replay with re-keyframe on large jumps per G4.b

## Scope

- `frontend/src/app/timeline/timeTravel.ts`

## Description

- Add `frontend/src/app/timeline/timeTravel.ts`: `TimeTravelDriver` owning
  the fetch/range policy over the S06 `DeltaLog` (seq-driven cursor per
  closed finding 005): first scrub re-keyframes (asof at T minus a 14-day
  margin, diff to now), every scrub inside the loaded range replays
  locally with ZERO fetches, jumps outside re-keyframe, sequence gaps
  shrink the trusted range and force the next re-keyframe.
- Map wire deltas onto the seam shape (`mapDelta`, clock-preserving) and
  push materialized slices through the locked commands (set-data +
  set-time); `spliceLive` consumes graph-channel SSE entries through the
  same append path on the same clock, and `lastSeq` exposes the stream's
  since= resume point.
- Bind it with `useTimeTravel`: time-travel mode scrubs through the
  driver; returning to LIVE issues set-time live and hands the stage back
  to the live keyframe effect (now gated on mode and re-pushing on
  return). Concurrent scrubs while a load is in flight coalesce to the
  latest target.
- Add `frontend/src/app/timeline/timeTravel.test.ts` against the revised
  mock: re-keyframe then zero-fetch local scrubbing (both directions),
  re-keyframe on out-of-range jumps, feature nodes present in historical
  slices, time-dependent state across T, and live splice extending the
  range.

## Outcome

Scrubbing the playhead renders the network as it stood at T - locally, at
frame rate, with the splice guarantees the contract commits. Gates green:
typecheck, eslint, vitest (166 passed), prettier.

## Notes

Liveness and scrubbing share one code path (append → replay) as the ADR
commits; wiring the live graph SSE channel into `spliceLive` activates
when the live stream consumers land (W03.P10 status work uses the same
stream).
