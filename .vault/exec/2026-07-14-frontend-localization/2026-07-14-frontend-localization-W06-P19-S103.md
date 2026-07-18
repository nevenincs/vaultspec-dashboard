---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-18'
modified: '2026-07-18'
step_id: 'S103'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Run all copy-sensitive component suites across every migrated domain without mocks, fakes, stubs, patches, skip, or xfail

## Scope

- `frontend/src/app/`

## Description

Ran the copy-sensitive component suites across `frontend/src/app/` live
against the real engine (spot-checked directly: `PlanStepTree.render.test.tsx`,
`src/app/agent/`; the remainder confirmed via the full `frontend/` suite run
for `S106`, which includes every file under `src/app/`).

## Outcome

Every `src/app/` suite passes: no red, no skip, no xfail. One flagged
observation, not blocking: `FeatureSearchField.test.tsx` and
`leftRailActions.test.tsx` `vi.mock("stores/server/queries")` to isolate pure
component-rendering logic — pre-existing (predates this campaign's earlier
tick of the former), arguably covered by the project's unit-test
pure-logic-isolation carve-out, but in tension with this step's literal
"without mocks" text. Recorded here, per the team lead's earlier ruling, as a
NAMED item for `P20`'s adjudication rather than something this step's own
pass resolves.

## Notes

This record was authored during the campaign's one closing cold-verification
pass — no code changes by me.

Independently reverified: live rerun of `PlanStepTree.render.test.tsx` +
`pipeline.test.ts` + `gitchanges.test.ts` + `src/app/agent/` — 90/90 passed;
the full `frontend/` suite run for `S106` (3682/3683, the one red a confirmed
unrelated flake) covers every remaining `src/app/` suite with no further
reds.
