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

**Amendment (2026-07-17, ripple from `S133`'s deletion):** `nowStrip.test.ts` — one
of this step's five verified-live files — retired with its own module at commit
`8c4220b333`. `nowStrip.ts` was scouted as fully orphaned in production (only its
own test imported it; the live system-status renderer,
`deriveSystemStatusRows`, is already descriptor-based and never consumed it) and
deleted outright under the same `S75`/`S236`/`S238` dead-code doctrine this
record already documents, approved by the team lead. This does not retroactively
invalidate this step's tick — at the time `S192` verified `nowStrip.test.ts`
live, the module was genuinely live and the test genuinely passed against real
production code; the file's later retirement is `S133`'s ripple, recorded here
for continuity rather than left as a dangling scope reference to a file that no
longer exists.
