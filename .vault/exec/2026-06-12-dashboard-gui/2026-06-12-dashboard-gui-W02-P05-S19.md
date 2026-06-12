---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S19'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the mock engine with HTTP handlers and SSE channels carrying sequence numbers and tier degradation blocks, toggled by env flag

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Add `frontend/src/testing/mockEngine.ts`: `MockEngine` serving the S18
  corpus through a fetch-shaped transport the S17 client plugs into
  unchanged - HTTP handlers for every routed family plus a real
  `text/event-stream` SSE response from a scriptable channel bus.
- Derive the delta timeline from the corpus event log (`buildDeltaTimeline`,
  pure): doc-created and commit events add nodes/edges, step-checked events
  change the plan node; seq is 1-based monotonic in ts order - the single
  delta clock asof, diff, and the graph SSE channel all share.
- Honor the contract guarantees in serving logic: every response carries
  the tiers block; the constellation query returns feature nodes plus
  engine-aggregated meta-edges only; historical slices exclude the semantic
  tier; `since=` on the stream replays missed deltas in seq order;
  scope-less working-tree reads fail 400 (stateless scope).
- Expose `degrade(tier, reason)` so rag-down (502 on search/discover/ops
  with a reasoned tier block) and the rest of the W03 degradation matrix
  are reachable - the debug switch input for S46.
- Toggle by env flag: `VITE_MOCK_ENGINE=1` makes the app bootstrap
  (`frontend/src/main.tsx`) dynamic-import the mock and swap the client
  transport via the new `EngineClient.useTransport`; the dynamic import
  keeps the mock out of the production bundle when the flag is off.
- Add `frontend/src/testing/mockEngine.test.ts`: timeline monotonicity,
  tiers block on every family, constellation granularity, plan interiors,
  asof+diff splice with no gap or overlap, historical semantic exclusion,
  truthful degradation, SSE frame format with seq, and scope enforcement.

## Outcome

The cross-plan dependency fence stands: all of W02 proceeds against a
contract-faithful engine, and the S49 origin swap is a transport change
only. Gates green: typecheck, eslint, vitest (105 passed), prettier.

## Notes

Remove/change deltas carry the entity payload with id load-bearing,
inheriting the S06 canonical shape as the audit finding
delta-remove-shape-002 required. The mock's `push()` lets tests and demos
drive live SSE events; the live splice path is exercised end-to-end in S34
time travel.

