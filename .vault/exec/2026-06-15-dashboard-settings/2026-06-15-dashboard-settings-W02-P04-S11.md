---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---




# Add the useSettingsSchema query hook with its query key and invalidation wiring

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the `useSettingsSchema` query hook with its key and `staleTime: Infinity` (the schema is stable for a deployment).

## Outcome

A cached schema read hook for the dialog.

## Notes

