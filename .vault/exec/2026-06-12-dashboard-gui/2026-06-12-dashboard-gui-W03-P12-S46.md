---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S46'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the degradation matrix states with a debug switch making every state reachable, and tests per G8.a

## Scope

- `frontend/src/app/degradation`

## Description

- Add `frontend/src/app/degradation/matrix.ts`: the ADR §8 table encoded
  as the pure `matrixFor` (condition inputs to per-surface states, with
  no-vault and stream-lost precedence), `deriveInputs` reading live
  conditions from the status snapshot (tier block, rag rollup, corpus
  emptiness), and the override store combining real conditions with debug
  toggles.
- Add `frontend/src/app/degradation/DebugSwitch.tsx`: the dev-only switch
  making every condition reachable - overrides flip the store AND, under
  the mock engine, drive `degrade()` so the SERVED data degrades too.
- Add `frontend/src/app/degradation/useDegradation.ts` and wire the first
  consumers: the timeline's LIVE chip becomes RECONNECTING on stream-lost,
  and the stage renders the no-vault invitation empty state; rag-down
  surfaces were already organic (tier block, search fallback, discover,
  rag card).
- Add `frontend/src/app/degradation/matrix.test.ts`: every §8 row asserted
  against the table, input derivation, and override combine/clear.

## Outcome

Degradation is a feature with a spec: each state reachable via the debug
switch and covered by tests per G8.a. Gates green: typecheck, eslint,
vitest (200 passed), prettier.

## Notes

Stream-lost detection wiring (flipping the real input when the SSE
consumer loses the connection) lands with the reconnect handling the
stream consumers own; the matrix, the override path, and the visible
states are complete now. The §7.4 illustrations replace the interim
text/tone treatments when the commissioned art lands.

