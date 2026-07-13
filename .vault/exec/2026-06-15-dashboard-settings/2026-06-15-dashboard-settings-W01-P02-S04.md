---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Add registry validation producing typed error kinds for unknown key and type or constraint violation

## Scope

- `engine/crates/vaultspec-session/src/settings.rs`

## Description

- Added `validate(key, value, scoped)` returning typed `ValidationError` kinds: `unknown_key`, `scope_not_allowed`, `invalid_value`.
- Refactored the pure type check into `check_value` so each value type is unit-testable without a registry entry.

## Outcome

Writes are typed-validated, not silently accepted; the canonical stored form is returned.

## Notes
