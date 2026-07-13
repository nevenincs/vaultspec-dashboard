---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Implement the graph-sync hook: subscribe the live graph channel, invalidate the constellation, track connection and lastSeq

## Scope

- `frontend/src/stores/server/graphSync.ts`

## Description

- Implemented `useGraphLiveSync(scope, enabled)`: in LIVE mode it subscribes the live
  `graph` SSE channel and, on new deltas, advances the live-connection `lastSeq` and
  invalidates the scope's constellation query (targeted cache invalidation, ADR D3) -
  the contract's stated liveness path.
- It tracks the stream connection into the live-connection slice (open/success ->
  connected, error/StreamLostError -> lost), which is what makes the stream-lost
  degradation truthful.
- Fixed two in-lane defects in `queries.ts` (adversarial finding stream-01): folded the
  resume `since` into `engineKeys.stream` so two resume offsets no longer collide on one
  cache entry, and replaced `refetchMode: "append"` with a seq-dedup `reducer` +
  `initialValue` so a reconnect's `since=` replay splices idempotently (contract
  section 7).

## Outcome

`stores/server/graphSync.ts` makes LIVE mode reactive and the connection signal real. 3
unit tests cover `maxSeq`, the active path (advance + connect + invalidate), and the
inert disabled path. The stream-01 cache-key assertion is now green.

## Notes

The `enabled` gate hands the scene to the time-travel driver while scrubbing. The
no-refetch delta animation onto the held model stays engine-blocked (S50 constellation
seq) and is documented at the seam. Both stream-01 adversarial assertions are now green
(verified in review): the cache-key fix lands assertion 1, and the seq-dedup reducer
plus the mock's bounded since= close (a concurrent hardening-campaign mock fix) land
assertion 2 in ~0.6s - it does not time out. The live hook subscribes at the live tail
(no since=) deliberately to avoid resubscribe churn; lastSeq is staged for the future
engine-unblocked delta animation's precise resume.
