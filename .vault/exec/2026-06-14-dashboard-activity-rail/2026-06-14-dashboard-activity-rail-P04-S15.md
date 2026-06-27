---
tags:
  - '#exec'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-14-dashboard-activity-rail-plan]]"
---

# Extend the rail unit tests to assert the RAIL_TABS strip is exactly now, work, changes, search in that order

## Scope

- `frontend/src/app/right/rail.test.ts`

## Description

- Extended the rail unit tests to assert `RAIL_TABS` is exactly now, work, changes, search in that order, and that `work` is reachable second.

## Outcome

Two new assertions in the rail test cover the four-tab IA order and the second-position placement.

## Notes

Required exporting `RAIL_TABS` from the shell module (mirrors how `OPS_WHITELIST` is exported and tested).
