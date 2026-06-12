---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S17'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the typed engine API client covering the contract query families map, vault-tree, graph query, nodes, filters, events, asof, diff, status, search, ops

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Rebuild `frontend/src/stores/server/engine.ts` into the typed
  `EngineClient` covering every contract query family: map, vault-tree,
  graph query (POST with engine-owned filter object), filters vocabulary,
  node detail/neighbors/evidence/discover, events (raw + bucketed), asof,
  diff, status, search, and the two ops proxy verbs; plus the multiplexed
  `streamUrl` with `since=` splice resume for S20's SSE consumption.
- Type the wire shapes snake_case as served, including the §2 cross-cutting
  guarantees: every response type carries the `tiers` degradation block;
  the delta entry type is the single shape shared by diff and the graph SSE
  channel; constellation meta-edges carry `{count, breakdown_by_tier}`.
- Make the transport injectable (`fetchImpl`, `baseUrl`) so tests drive it
  with a recording fetch and S49 swaps mock for live origin without
  touching call sites; non-2xx raises a typed `EngineError` with path and
  status.
- Keep `useEngineStatus` working over the new client (the AppShell consumer
  is untouched); hooks otherwise land in S20.
- Add `frontend/src/stores/server/engine.test.ts` verifying every family's
  path, GET/POST split, stream URL building, and typed errors.

## Outcome

One client surface speaks the whole contract; running it unchanged against
the S19 mock and the live origin is the S49 contract-shape verification.
Gates green: typecheck, eslint, vitest (89 passed), prettier.

## Notes

Endpoint paths follow the contract's illustrative shapes; they are
confirmed against the live engine at S49 (capabilities binding, shapes
illustrative per the contract status line).

