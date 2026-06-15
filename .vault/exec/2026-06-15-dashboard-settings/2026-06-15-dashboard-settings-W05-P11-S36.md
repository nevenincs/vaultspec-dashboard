---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S36'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---




# Update mockEngine and conformance fixtures for the theme setting end-to-end

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Confirmed theme end-to-end through the mock (registry + bridge) and added the non-theme effects bridge (`settingsEffects.ts`) so reduce_motion and default_granularity are consumed; tests cover both.

## Outcome

Every served setting has a real consumer (review HIGH-1 closed).

## Notes

