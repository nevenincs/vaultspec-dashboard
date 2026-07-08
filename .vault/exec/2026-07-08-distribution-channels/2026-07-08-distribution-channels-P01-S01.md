---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S01'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# move the embed folder attribute to the crate-internal staged assets/spa directory

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Move the rust-embed folder attribute from the boundary-escaping `../../../frontend/dist` to the crate-internal `assets/spa` (relative paths resolve from the crate manifest at derive time; missing staging stays a compile error)

## Outcome

601 feature-on and 598 feature-off lib tests pass; the embedded suite now exercises the staged crate assets. `rustfmt --check` clean.

## Notes

- None.
