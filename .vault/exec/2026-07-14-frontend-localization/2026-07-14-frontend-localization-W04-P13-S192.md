---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S192'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate view-store presentation tests against real production descriptors and formatters

## Scope

- `frontend/src/stores/view/nowStrip.test.ts`
- `frontend/src/stores/view/settingsControlRow.test.ts`
- `frontend/src/stores/view/workTabChrome.test.ts`
- `frontend/src/stores/view/contextMenu.test.ts`
- `frontend/src/stores/view/provisionActions.test.ts`

## Description

- Confirmed none of the five test files mock or stub the localization runtime.
- Ran all five test files live against the production engine and catalogs; all cases
  pass.

## Outcome

The view-store presentation tests exercise real production descriptors and
formatters end to end.

## Notes

Rescoped by the team lead's ruling (2026-07-17): the step's original scope also named
`opsPanel.test.ts`, `statusCard.test.ts`, and `inspector.test.ts`. All three source
modules (`opsPanel.ts`, `statusCard.ts`, `inspector.ts`) were deleted with their tests
as dead code — `opsPanel.ts` explicitly reaped as "console-era dead code" in commit
`895c058524`, `statusCard.ts` and `inspector.ts` deleted with zero live references
anywhere in the tree in bulk commit `3562d0262a`. Their own plan steps
(`W04.P13.S75`, `S236`, `S238`) were retired via `vaultspec-core vault plan step
remove` on the same ruling; this step's scope was correspondingly edited via
`vaultspec-core vault plan step edit` to the five files that still exist. This record
retroactively documents and ticks the rescoped step; verification was a live
focused-test run, not a fresh implementation.
