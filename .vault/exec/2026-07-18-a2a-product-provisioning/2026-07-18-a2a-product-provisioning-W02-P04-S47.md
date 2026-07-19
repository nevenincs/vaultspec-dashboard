---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S47'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Expose bounded A2A lifecycle status and action subcommands without free-form executable or path operands

## Scope

- `engine/crates/vaultspec-cli/src/main.rs`

## Description

- Added a bounded `A2a` subcommand with a closed action enum (`status`/`doctor`/`stop`/`remove`) - clap rejects any token outside the set, so the verb selects semantic intent, never a free-form executable or path operand.
- Routed it through the machine-verb dispatch block (workspace-free, like `stop`/`open`) with a total mapping into the typed action.

## Outcome

`vaultspec a2a <action>` is exposed with no free-form operands. cli tests plus clippy all-targets green (both `Command` match arms updated).

## Notes

None.
