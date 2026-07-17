---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S78'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate localized document, listing, dashboard, pipeline, history, change, and workspace query tests against production descriptors and live wire data

## Scope

- `frontend/src/stores/server/queries/document.test.ts`
- `frontend/src/stores/server/queries/listings.test.ts`
- `frontend/src/stores/server/queries/dashboard.test.ts`
- `frontend/src/stores/server/queries/pipeline.test.ts`
- `frontend/src/stores/server/queries/history-github.test.ts`
- `frontend/src/stores/server/queries/gitchanges.test.ts`
- `frontend/src/stores/server/queries/workspaces.test.ts`

## Description

- Confirmed none of the seven test files mock or stub the localization runtime or the
  wire.
- Ran the full set live against the production engine and catalogs; all 7 files / 157
  tests pass.

## Outcome

Every store query test in this step's scope exercises production locale resources and
real wire data end to end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation. Note: this test suite passing does NOT mean every query module
in this step's family is fully localized — `gitchanges.ts` (the source module under
`W04.P13.S234`, still open) carries a genuine hardcoded English bucket-label map
(`GIT_CHANGE_BUCKET_LABEL`); its test passes because it also asserts English by
default, so the suite's own green status does not certify that module's correctness.
