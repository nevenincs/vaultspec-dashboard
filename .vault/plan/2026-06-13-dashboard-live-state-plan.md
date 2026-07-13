---
tags:
  - '#plan'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-13-dashboard-live-state-adr]]'
  - '[[2026-06-13-dashboard-live-state-research]]'
---

# `dashboard-live-state` plan

Complete the unwired live and degradation plane of the Data and State layer: model live-connection state, surface the stream-lost and structural-broken degradation truths, and make LIVE mode reactive by stream-driven invalidation.

### Phase `P01` - Live-connection state and disconnect contract

Model the runtime stream-connection state and make the SSE consumer signal a lost stream.

- [x] `P01.S01` - Add the scope-keyed live-connection slice holding streamConnected, lastSeq, and brokenLinkCount; `frontend/src/stores/server/liveStatus.ts`.
- [x] `P01.S02` - Throw StreamLostError on an abnormal stream close or non-ok response in the SSE consumer; `frontend/src/stores/server/queries.ts`.

### Phase `P02` - Live reactivity and degradation truth

Make LIVE mode reactive via stream-driven invalidation and replace the two hardwired degradation inputs with real derivation.

- [x] `P02.S03` - Implement the graph-sync hook: subscribe the live graph channel, invalidate the constellation, track connection and lastSeq; `frontend/src/stores/server/graphSync.ts`.
- [x] `P02.S04` - Extend deriveInputs to read injected live signals for streamLost and brokenLinkCount, keeping it pure; `frontend/src/app/degradation/matrix.ts`.
- [x] `P02.S05` - Compose the live-connection slice into the surface-states hook; `frontend/src/app/degradation/useDegradation.ts`.
- [x] `P02.S06` - Bind setDegradationHandler in app bootstrap so a stream-lost classification flips streamConnected false; `frontend/src/main.tsx`.
- [x] `P02.S07` - Mount the graph-sync hook and push the held slice broken-link count from the Stage; `frontend/src/app/stage/Stage.tsx`.

### Phase `P03` - Live verification

Prove stream-lost degradation and live reactivity against the running app and ship every gate green.

- [x] `P03.S08` - Add the live e2e for the stream-lost degraded surface and live reactivity; `frontend/e2e/adverse.spec.ts`.
- [x] `P03.S09` - Run typecheck, lint, test, build, and vault check green and record the verification; `frontend/`.

## Description

This plan executes the `dashboard-live-state` ADR: it completes the unwired remainder of
the Data and State layer found by the gap analysis. The state machinery is already built;
this wires built consumers to built producers. P01 models the runtime live-connection
state (D1) and makes the SSE consumer throw `StreamLostError` on an abnormal close (D2).
P02 makes LIVE mode reactive by subscribing the live `graph` channel and invalidating the
constellation (D3), replaces the two hardwired degradation inputs with real derivation
(D4), and binds the platform failure policy so a stream-lost classification flips the
live-connection signal (D5). P03 verifies against the running app. The no-refetch live
delta animation stays engine-blocked on the S50 constellation-seq divergence and is
flagged at the seam, not built.

## Steps

The Phase and Step structure for this L2 plan is rendered above, beneath the plan title.
Three phases, nine steps.

## Parallelization

Phases are sequenced by dependency. `P01.S01` (the live-connection slice) gates almost
everything downstream - the disconnect contract, the degradation derivation, and the
bootstrap binding all read or write it - so it lands first; `P01.S02` (the
`StreamLostError` throw) is independent of it and may proceed in parallel within P01.
In `P02`, `P02.S03` (graph-sync) depends on `P01.S01`; `P02.S04` (pure `deriveInputs`
extension) is independent and can land first; `P02.S05` depends on S04 and S01; `P02.S06`
(bootstrap binding) depends on S01 and the platform policy; `P02.S07` (Stage wiring)
depends on S03 and S01 and must come last in P02 because it mounts the assembled hook.
`P03` is strictly last.

## Verification

The plan is complete when every Step is closed and all of the following hold:

- `cd frontend && npm run typecheck` passes with zero errors.
- `cd frontend && npm run lint` passes clean (no new disables).
- `cd frontend && npm run test` passes, including new unit tests for the live-connection
  slice, the `StreamLostError` throw path, the graph-sync invalidation, and the
  `deriveInputs` live-signal branches (stream-lost and broken-link rows).
- `cd frontend && npm run build` produces a production bundle.
- The live pass demonstrates, against the running app, that a lost stream renders the
  designed `reconnecting`/stale degraded surface (not a crash, not a silent swallow) and
  that a live `graph` wire change invalidates and refreshes the constellation; the
  no-refetch delta animation remains an engine-blocked follow-on (S50), flagged not
  faked.
- `vaultspec-core vault check all` is green.
- The `vaultspec-code-review` audit signs off with no unresolved HIGH findings.
