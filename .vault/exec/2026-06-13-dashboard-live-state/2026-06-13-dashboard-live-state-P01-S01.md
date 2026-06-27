---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Add the scope-keyed live-connection slice holding streamConnected, lastSeq, and brokenLinkCount

## Scope

- `frontend/src/stores/server/liveStatus.ts`

## Description

- Added `useLiveStatusStore` (Zustand): the stores-owned runtime live-connection state
  the system did not model before - `streamConnected` (`null` = no stream expected, only
  explicit `false` is lost), `lastSeq` (the `since=` resume point), and `brokenLinkCount`.
- `setLastSeq` advances monotonically (a stale frame never moves it backward);
  `setBrokenLinkCount` is identity-stable (no-op on an unchanged value to avoid render
  churn); `reset` clears the whole plane for a wholesale scope swap.
- Exported `isStreamLost(state)` so the degradation derivation reads the lost truth
  without re-implementing the null-vs-false rule.

## Outcome

`stores/server/liveStatus.ts` is ADR D1: liveness is now first-class state both the
degradation derivation and the stream resume read. 8 unit tests cover initial state,
connection tracking, monotonic seq, idempotent broken-count, reset, and the
`isStreamLost` null/true/false rule.

## Notes

`null` vs `false` is the load-bearing distinction: before the first stream connects the
GUI must not show a "lost" surface. No scaffolds left.
