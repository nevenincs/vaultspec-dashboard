---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S04'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---




# add temporal graph mode to the representation dispatcher and dashboard state contract

## Scope

- `frontend representation mode state`

## Description

- Added `temporal` to representation-mode types and backend dashboard-state enum.

## Outcome

`representationLayout` now handles temporal mode by reading finite `seedPosition` values, and both frontend adapters and the API state enum accept `temporal`.

## Notes

Verified by frontend typecheck and the backend dashboard-state patch test.