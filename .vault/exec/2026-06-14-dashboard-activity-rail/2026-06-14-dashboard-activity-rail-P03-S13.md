---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Confirm the four-tab strip preserves keyboard tab order with the work tab reachable second in sequence

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Confirmed the four-tab strip preserves keyboard tab order with the `work` tab reachable second in sequence.

## Outcome

Tab order follows `RAIL_TABS` array order; `work` is second.

## Notes

Asserted by the extended rail unit test (work reachable second).
