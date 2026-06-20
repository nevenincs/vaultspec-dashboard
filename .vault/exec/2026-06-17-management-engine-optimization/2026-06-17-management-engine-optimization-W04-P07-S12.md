---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S12'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---




# Rewrite backend-facing MockEngine coverage to live adapters

## Scope

- `frontend/src/stores/server`

## Description

- Remove `MockEngine` imports and mock transport helpers from `liveAdapters.test.ts`.
- Delete backend-fidelity assertions that drove `EngineClient` through `MockEngine`.
- Remove `MockEngine` imports, mock stream tests, and mock lineage route assertions from
  `queries.test.ts`.
- Retain parser, adapter, reducer, and captured live-shaped body assertions that do not
  instantiate backend doubles.

## Outcome

No `MockEngine`, `MOCK_SCOPE`, or `testing/mockEngine` references remain under
`frontend/src/stores/server`. The store/server backend signal is no longer backed by
the authored TypeScript engine double.

## Notes

Verification:

- `node node_modules/vitest/vitest.mjs run src/stores/server/liveAdapters.test.ts`
- `node node_modules/vitest/vitest.mjs run src/stores/server/queries.test.ts`
- `rg -n "MockEngine|testing/mockEngine|MOCK_SCOPE" frontend/src/stores/server`
