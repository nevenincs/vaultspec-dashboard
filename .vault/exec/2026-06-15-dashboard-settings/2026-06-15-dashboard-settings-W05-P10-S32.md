---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:eef8d4aa299c9bca461385f234b029dc72397dae0e6f97e552431faf89480eb1'
step_id: 'S32'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Add the theme registry entry as a scope-ineligible global enum setting

## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs`

## Description

- Declared `theme` in the registry as a global enum (system/light/dark/high-contrast).

## Outcome

Theme is an engine-owned setting (the flagship wired one).

## Notes
