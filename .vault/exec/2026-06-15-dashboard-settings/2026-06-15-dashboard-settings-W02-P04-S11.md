---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:b0b5614a2e2312ba0d44006cc95de086b57fe265a7a13e5a32795cc534fac697'
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
