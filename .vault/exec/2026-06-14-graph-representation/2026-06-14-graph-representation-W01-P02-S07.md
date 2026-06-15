---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Add activeLens and setActiveLens to the view store distinct from named-filter lenses

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description


## Outcome

Added `activeLens`/`setActiveLens` to the view store (default status); it does NOT reset on scope swap (a lens travels with the viewer). Distinct from named-filter lenses and the tier dial.

## Notes

