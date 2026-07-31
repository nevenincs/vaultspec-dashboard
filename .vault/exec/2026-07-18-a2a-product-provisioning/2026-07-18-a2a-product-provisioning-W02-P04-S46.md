---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
body_hash: 'sha256:b66168a8139d09db57002c05ff259a8df5ce25507eb7953a1535dc17e3d23f4a'
step_id: 'S46'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Export the one-shot product lifecycle command module

## Scope

- `engine/crates/vaultspec-cli/src/cmd/mod.rs`

## Description

- Exported the one-shot A2A lifecycle command module from the CLI `cmd` module.

## Outcome

The module is reachable from `main`. cli build plus clippy green.

## Notes

None.
