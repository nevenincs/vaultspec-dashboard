---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---




# Add the work tab entry to the RAIL_TABS array in second position so the order reads now, work, changes, search

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Added the `work` tab entry to the `RAIL_TABS` array in second position, giving the order now, work, changes, search.
- Annotated the four-tab review-rail intent: `work` between the liveness pillar and the evidence pillar.

## Outcome

`RAIL_TABS` now carries four entries in the IA-specified order; `work` reachable second.

## Notes

The `now` tab keeps its internal id `activity`; no membership change to existing tabs.
