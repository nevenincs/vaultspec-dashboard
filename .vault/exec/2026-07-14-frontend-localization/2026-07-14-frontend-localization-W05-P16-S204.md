---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S204'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate settings-control and theme tests through production catalogs

## Scope

- `frontend/src/app/settings/controls/controls.render.test.tsx`
- `frontend/src/app/settings/controls/KeybindingControl.test.tsx`
- `frontend/src/app/settings/themeSetting.test.tsx`

## Description

- Confirmed none of the three test files mock or stub the localization runtime.
- Ran all three test files live against the production engine and catalogs; all cases
  pass.

## Outcome

The settings-control and theme tests exercise production locale resources end to end.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This record retroactively
documents and ticks the plan step; verification was a live focused-test run, not a
fresh implementation.
