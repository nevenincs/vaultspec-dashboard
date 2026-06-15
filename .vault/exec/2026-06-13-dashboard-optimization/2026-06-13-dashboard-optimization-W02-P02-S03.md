---
tags:
  - '#exec'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-13-dashboard-optimization-plan]]"
---




# Bound the streamed-query accumulator to a summary so it cannot grow session-unbounded

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Ring-capped the streamed-query accumulator (P-HIGH-6): `streamReducer` now retains only
  the last `STREAM_RETENTION` (256) chunks instead of `[...acc, chunk]` for the whole
  session. Exported the reducer + cap for the regression test.
- Reproduce + regression test: reduce 10,000 synthetic deltas through it and assert the
  accumulator stays at the cap (would be 10,000 unbounded) while the latest seq is always
  retained so consumers' `maxSeq` stays correct; plus a within-window dedup test.

## Outcome

The worst always-on memory hotspot is closed: the live accumulator is bounded by
construction, and the per-append dedup scan is now O(cap), not O(session). Shape
unchanged (`StreamChunk[]`), so `graphSync` (reads latest seq) and `NowStrip` (reads
recent per-channel frames) are unaffected. Suite green.

## Notes

256 covers the diff/scrub `since=` replay window and the live tail; seq monotonicity means
the highest seq is always in the retained tail. The accumulator-policy is now codify
candidate `live-accumulators-are-bounded` (ADR), deferred to a second instance.
