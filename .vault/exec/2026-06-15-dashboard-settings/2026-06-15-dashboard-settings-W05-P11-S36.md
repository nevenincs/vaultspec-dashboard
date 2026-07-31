---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:84d248e5fc521c7d4874902562d71abe20523d6da7693b97554d5377ccbd4811'
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
