---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S185'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate right-rail menu tests through production catalogs

## Scope

- `frontend/src/app/right/menus/rightMenus.test.ts`
- `frontend/src/app/right/menus/commitMenu.timeTravel.test.ts`

## Description

- `rightMenus.test.ts` had a stale-shape defect on its `edgeMenu` disabled-reason
  assertions: it expected raw strings (`"no relation"`, `"no destination"`) where
  `edgeMenu.ts` (already correctly localized under `W04.P10.S183`) returns typed
  key descriptors. The coding lane (opus-l10n) updated the assertions to
  `toEqual({ key: "common:disabledReasons.noRelation" })` /
  `{ key: "common:disabledReasons.noDestination" }`.
- `commitMenu.timeTravel.test.ts` was already correct.

## Outcome

Both right-rail menu test files assert against the actual typed-descriptor shape
the menus produce.

## Notes

FLAG (out of scope for this step, reported by opus-l10n, cross-referencing here for
the record): the same `rightMenus.test.ts` file still asserts
`find(bare, "edge:copy-id").disabled` is `undefined` — i.e. the test still
expects `edgeMenu.ts`'s `edge:copy-id` action (which copies the RAW edge id) to
exist and be enabled. That action is the same CMCS-001 copy-safety class as the
`S177`/`S179` defects already fixed on `graphNodeMenu.ts`/`metaEdgeMenu.ts`, but
`edgeMenu.ts` itself was NOT touched by this fix — `W04.P10.S183` (already ticked)
did not catch it because the plan step's own scanner/grep pass predates the
copy-safety audit. This is a live gap for a follow-up fix, not resolved by this
record — per the team lead's ruling, it will land as an amendment to `S183`'s own
exec record, not a new step tick. Independently reran both files live — part of
the 15/15 passing set. Fixed by opus-l10n, landed at commit `578b4e5454` ("batch
#2 test-only stale assertions to typed/sentence-case output ... dual-verified"),
not a fresh implementation on my part.
