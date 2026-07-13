---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Build the control registry mapping a UI-hint control kind to its control component

## Scope

- `frontend/src/app/settings/controls/registry.ts`

## Description

- Built the control registry mapping a UI-hint control kind to its renderer plus a `SettingControl` dispatch component.

## Outcome

Adding a setting reusing an existing kind needs no change here; a novel kind is one entry + one component.

## Notes
