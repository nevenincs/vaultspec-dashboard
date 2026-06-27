---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Add the engine client method and types for GET /settings/schema

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Added the client types (`SettingsSchema`, `SettingDef`, `SettingValueType`, `SettingControlKind`), the `settingsSchema()` client method, and `EngineError.errorKind`/`errorMessage` getters for typed validation errors.

## Outcome

The stores client can read the schema and surface typed write errors.

## Notes
