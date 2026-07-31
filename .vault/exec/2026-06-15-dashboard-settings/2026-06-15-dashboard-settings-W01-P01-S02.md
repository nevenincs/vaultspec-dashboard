---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:f697aba8f223742e1ad36fd8095ca102b7318607dbcc0d9c3843b5688f557e73'
step_id: 'S02'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Author the v1 registry entries including the initial extendable setting set

## Scope

- `engine/crates/vaultspec-session/src/settings_schema.rs`

## Description

- Authored the v1 registry in `build_registry()` with the engine-owned group display order.
- Each entry declares key, value type + constraints, default, scope-eligibility, control kind, label, description, group, and order.

## Outcome

The declarative registry is the one place a setting is declared; adding a setting is one entry here.

## Notes

The initial registry carried `node_label_scale` (slider); it was later dropped in the review revision because it had no consumer (the slider control remains in the kit).
