---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Thread the sort into `deriveVaultRailView`: document order inside category folders and feature-folder order derive from the one sort value

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- `compareVaultEntriesBySort` in `queries.ts`: recency = historical comparator; name/created/modified/size fields with absent-last, path tiebreak
- `projectVaultDocTypeGroups` / `projectVaultTreeFeatureGroups` / `deriveVaultRailView` accept the sort; feature folders order by name / newest member date / summed words
- Default order preserved byte-for-byte (unit-asserted)

## Outcome

New sort-plane unit tests green; default-order regression test green.

## Notes

None.
