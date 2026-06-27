---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Confirm the work tab button carries role=tab and aria-selected reflecting the active tab like the other three tabs

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Confirmed the `work` tab button carries `role=tab` and `aria-selected` reflecting the active tab, like the other three tabs.

## Outcome

The `work` tab participates in the existing per-tab a11y contract unchanged.

## Notes

The tab buttons are rendered by mapping `RAIL_TABS`, so the affordance is uniform across all four tabs.
