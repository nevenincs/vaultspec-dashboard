---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S14'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---




# Remove fake and stub positive-signal fixtures

## Scope

- `frontend/src/testing`

## Description

- Move the authored engine double and its synthetic corpus out of `frontend/src/testing`.
- Remove the surviving mock-coupled `pushStorm` helper from `adverse.ts`.
- Keep only live-client setup, adverse pure generators, and live-vault fixture data in
  `frontend/src/testing`.
- Retain the seeded engine wire under retired-gallery-only support for design surfaces, not
  Vitest backend confidence.

## Outcome

`frontend/src/testing` no longer exports `MockEngine`, `MOCK_SCOPE`, `getMockEngine`,
or the synthetic mock corpus. The default test source tree has no imports of the authored
engine double.

## Notes

Verification:

- `rg -n 'from ["''].*mockEngine|MockEngine|MOCK_SCOPE|getMockEngine|isMockEngineEnabled|pushStorm|testing/fixtures/corpus' frontend/src --glob '*.ts' --glob '*.tsx'`
- `node node_modules/vitest/vitest.mjs run src/testing/adverse.test.ts src/platform/timing.test.ts src/stores/server/queries.test.ts`
- `node node_modules/vitest/vitest.mjs run`
