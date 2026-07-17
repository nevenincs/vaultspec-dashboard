---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S174'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate filter and state render tests through production catalogs

## Scope

- `frontend/src/app/left/RailFilterField.render.test.tsx`
- `frontend/src/app/left/railStates.render.test.tsx`
- `frontend/src/app/stage/FilterMenu.render.test.tsx`
- `frontend/src/app/stage/FilterSidebar.planStates.test.ts`

## Description

- `RailFilterField.render.test.tsx` had a stale-casing defect: it asserted the
  accessible field label `"filter the vault by feature"` and the clear button's name
  `"clear search"` (both lowercase), while the production catalog resolves the
  sentence-case forms `"Filter the vault by feature"`
  (`common:rail.filters.featureAria`) and `"Clear search"`
  (`common:actions.clearSearch`). The coding lane (opus-l10n) updated both
  assertions to match the catalog's actual sentence-case output.
- The other three files in scope were already correctly asserting against
  production catalogs.

## Outcome

All four filter and state render tests exercise production locale resources
end to end; none mocks or stubs the localization runtime.

## Notes

FINDING: this was the same stale-casing defect class as `W05.P15.S89`/`S198`
(a test asserting pre-label-casing-policy lowercase text against the now
sentence-case catalog output) — a case-sensitivity gap in `screen.getByLabelText`/
`getByRole({ name })` lookups, not a component defect. `RailFilterField.tsx` itself
was never broken. Fixed by opus-l10n, independently reverified: reran all four
files live — 15/15 passed. This record was authored during a reconciliation pass;
not a fresh implementation on my part.
