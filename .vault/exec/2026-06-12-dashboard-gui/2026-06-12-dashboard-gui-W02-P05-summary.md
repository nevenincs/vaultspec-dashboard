---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
related:
  - '[[2026-06-12-dashboard-gui-plan]]'
---

# `dashboard-gui` `W02.P05` summary

Phase W02.P05 (contract mock fixtures) is complete: all four Steps closed,
frontend quality gates green at the boundary (typecheck, eslint, vitest 111
passed across 19 files, prettier, production build). This phase is the
cross-plan dependency fence: every remaining W02 phase now proceeds against
contract-mock fixtures with no engine-plan dependency until W03.P12
S49/S50.

- Modified: `frontend/src/stores/server/engine.ts`
- Created: `frontend/src/stores/server/engine.test.ts`
- Created: `frontend/src/stores/server/queries.ts`
- Created: `frontend/src/stores/server/queries.test.ts`
- Created: `frontend/src/testing/fixtures/corpus.ts`
- Created: `frontend/src/testing/fixtures/corpus.test.ts`
- Created: `frontend/src/testing/mockEngine.ts`
- Created: `frontend/src/testing/mockEngine.test.ts`
- Modified: `frontend/src/main.tsx`

## Description

- S17 rebuilt the engine client as the typed `EngineClient` covering every
  contract query family with injectable transport, snake_case wire types,
  tiers blocks on every response, the single delta-entry shape, and typed
  errors.
- S18 built the deterministic fixture corpus: twelve features with full
  document lifecycles, four-tier edges with structural states and
  sub-1-confidence semantics, engine-style meta-edge aggregation, plan
  interiors matching progress rings, and a dated event log with
  load-bearing node ids.
- S19 built the mock engine: fetch-shaped HTTP handlers plus a real
  `text/event-stream` SSE bus on the single delta clock, honoring
  constellation granularity, historical semantic exclusion, stateless
  scope, and truthful degradation (`degrade()` is the W03 debug-switch
  input). Toggled by `VITE_MOCK_ENGINE=1`, dynamic-imported so it stays out
  of the production bundle.
- S20 wired TanStack Query: key factory carrying the (scope, filter,
  as-of) cacheability triple, read hooks for every family, and
  `streamedQuery` SSE consumption over a pure event-stream parser.

The phase's binding property, verified by test: the same client code path
serves mock and live - the S49 swap is a transport change only, and the
mock honors the contract guarantees (tiers blocks, delta-clock splice with
no gap or duplicate, meta-edges only at constellation level).
