---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Rail-top sort control beside the filter field (Vault mode only) and `vault-section` menu enrollment of sort, reset-sorting, reset-filters, clear-filter, toggle-facets verbs

## Scope

- `frontend/src/app/left`

## Description

- Rail-top `VaultTreeOptionsButton` in `BrowserRegion.tsx` (Vault mode only) opening the SAME vault-section menu — zero new entity kind
- `vaultSectionMenu` enrolls sort options, reset-sorting, toggle-facets, reset-filters, clear-filter (new imperative `clearDashboardFilters` seam in `dashboardState.ts`, `setDashboardFeatureFilter(scope, "")` for clear) + expand/collapse + new document

## Outcome

Live-verified: Sort by Name reorders the tree; Reset Sorting restores the default; code tree offers no sort control.

## Notes

None.
