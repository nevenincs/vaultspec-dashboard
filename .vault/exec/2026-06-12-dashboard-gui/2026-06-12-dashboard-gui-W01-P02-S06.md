---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S06'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement keyframe set-data and apply-deltas replay on the single sequence clock with splice-gap re-keyframe per G4.b

## Scope

- `frontend/src/scene/deltaLog.ts`

## Description

- Add `frontend/src/scene/deltaLog.ts`: `DeltaLog` holding one keyframe (the
  asof snapshot with its t and seq anchors) plus an ordered delta log on the
  contract's single monotonic sequence clock - diff responses and live
  graph-channel SSE batches splice through one `append` code path.
- Implement splice semantics per the contract's REDLINE-3 guarantee:
  entries at or below `lastSeq` drop as duplicates (idempotent LIVE splice,
  no duplicate), a jump past `lastSeq + 1` refuses the batch from the gap on
  and flips `needsKeyframe` (no silent gap).
- Implement `replayTo(t | "live")` with an incremental forward cursor (the
  60fps scrub path applies only pending deltas) and keyframe rebuild on
  backward motion; large jumps are the owner's re-keyframe case per G4.b.
- Add `frontend/src/scene/deltaLog.test.ts` covering keyframe requirement,
  forward/live replay, backward rebuild plus forward consistency, duplicate
  drop at the splice, gap refusal plus re-keyframe recovery, and keyframe
  seq anchoring.

## Outcome

Liveness and scrubbing share one animation code path as the ADR commits:
the same `DeltaLog` consumes diff ranges and the live stream on one clock,
and the splice produces no gap and no duplicate (verified by test). Gates
green: typecheck, eslint, vitest (27 passed), prettier.

## Notes

The log holds raw deltas unbounded for the loaded range; range eviction and
re-keyframe policy (when scrub jumps outside the held range) belong to the
timeline's time-travel driver (W02.P08.S34), which owns asof/diff fetching.

