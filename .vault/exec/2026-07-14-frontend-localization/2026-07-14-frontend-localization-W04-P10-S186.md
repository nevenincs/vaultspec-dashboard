---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S186'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate right-rail action and rail-state tests through production catalogs

## Scope

- `frontend/src/app/right/rightRailActions.test.tsx`
- `frontend/src/app/right/rail.test.ts`

## Description

- `rail.test.ts` had a stale-shape defect: its status-section-composition
  assertion expected raw string titles (`"Plans"`, `"Pull requests"`, `"Issues"`,
  `"Commits"`) where the rail composer now produces typed key descriptors
  (`{ key: "common:finalWave.statusSections.plans" }`, etc.). The coding lane
  (opus-l10n) updated the assertion to the typed-descriptor shape.
- `rightRailActions.test.tsx` was already correct.

## Outcome

Both files assert against the actual typed-descriptor shape the rail composition
produces.

## Notes

Fixed by opus-l10n, independently reverified: reran both files live — part of the
15/15 passing set. Not a fresh implementation on my part.
