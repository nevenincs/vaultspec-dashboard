---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S51'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate left-rail browser render tests through production catalogs

## Scope

- `frontend/src/app/left/VaultBrowser.render.test.tsx`
- `frontend/src/app/left/VaultBrowser.compact.render.test.tsx`

## Description

- Confirmed neither test file mocks or stubs the localization runtime.
- Ran both test files live against the production engine and catalogs; all cases pass.

## Outcome

The left-rail browser render tests exercise production locale resources end to end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation.

AMENDMENT (2026-07-17): at initial tick, `VaultBrowser.test.ts` (a third render-suite
file, distinct from the two above but exercising the same module) still asserted raw
freshness strings (`"9h"`, `"3d"`) sourced from the then-unlocalized
`presentation/freshness.ts` (`W03.P07.S113`). That defect has since landed atomically:
`freshness.ts` now returns a typed `{ descriptor, fresh }` pair, and
`VaultBrowser.test.ts` was rewritten to resolve assertions through the runtime rather
than comparing raw strings. Independently reran `VaultBrowser.test.ts` alongside the two
render suites in this step's own scope; all green. No further action needed.
