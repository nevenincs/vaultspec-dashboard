---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S84'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate review-station and diff tests through production catalogs and real behavior

## Scope

- `frontend/src/app/authoring/ReviewStation.render.test.tsx`
- `frontend/src/app/authoring/DiffView.render.test.tsx`
- `frontend/src/app/authoring/diffLines.test.ts`

## Description

- Confirmed none of the three test files mock or stub the localization runtime.
- Ran all three test files live against the production engine and catalogs; all cases
  pass.

## Outcome

The review-station and diff tests exercise production catalogs and real behavior end
to end.

## Notes

Rescoped by the team lead's ruling (2026-07-17): the step's original scope named
`DiffPanel.render.test.tsx`, which no longer exists. The diff renderer was unified in
commit `b15c6dc51e` ("refactor(authoring): W01 — unify the diff renderer and remove
the review sign-in gate"); `DiffPanel.tsx` survives as a thin wrapper over the new
`DiffView.tsx` (verified and ticked under `W05.P14.S81`), and its render-test coverage
moved to `DiffView.render.test.tsx`. This step's scope was edited via
`vaultspec-core vault plan step edit` to name the surviving test file. This record
retroactively documents and ticks the rescoped step; verification was a live
focused-test run, not a fresh implementation.
