---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Add the work tab branch to the tab-content dispatch in ActivityRail rendering the WorkTab frame component

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Added the `work` tab branch to the `ActivityRail` tab-content dispatch, rendering the `WorkTab` frame component.

## Outcome

Selecting the `work` tab renders `WorkTab`; the dispatch is exhaustive over the union.

## Notes

Dispatch ordering mirrors the tab-strip order.
