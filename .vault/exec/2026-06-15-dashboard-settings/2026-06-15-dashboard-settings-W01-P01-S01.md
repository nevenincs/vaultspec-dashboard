---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:aab42abe5f39e91b2e6522f0ce1c48fd983b06be31a44d22fe8af27fd231bb81'
step_id: 'S01'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Define the settings schema registry types: key, value type, default, scope eligibility, constraints, and UI-hint control kind

## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs`

## Description

- Defined the schema vocabulary in the session crate: the tagged `SettingType` (enum/bool/string/integer with constraints), `ControlKind` (segmented/switch/text/slider), the `SettingDef` record, and the typed `ValidationError`.
- Made every type serde-serializable so the registry serializes straight onto the wire.

## Outcome

A typed, serializable registry vocabulary in place as the foundation for the single source of truth.

## Notes
