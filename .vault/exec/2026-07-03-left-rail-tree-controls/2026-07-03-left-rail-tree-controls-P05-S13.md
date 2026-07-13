---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Add `docs` and `weight` sort keys: option registry, projection comparators, feature `weightBytes` aggregate + `totalCorpusBytes` denominator

## Scope

- `frontend/src/stores`

## Description

- Add `docs` and `weight` to `RailSortKey` + `RAIL_SORT_OPTIONS` ("Document Count", "Corpus Weight") in `railSort.ts`
- `queries.ts`: `weight` compares served bytes (documents) / summed `weightBytes` (features, absent-last); `docs` is the explicit count order for feature folders while document lists keep recency
- `VaultTreeFeatureGroup.weightBytes` aggregate + `VaultRailView.totalCorpusBytes` denominator (unfiltered listing, so a narrow never inflates shares)
- Palette/menu enrollment is automatic (options derive the shared descriptors); guard expectation arrays updated
- Unit tests: weight order with unweighed-last + denominator, docs count order

## Outcome

Suites green (75 across sort/menus/palette/guards).

## Notes

None.
