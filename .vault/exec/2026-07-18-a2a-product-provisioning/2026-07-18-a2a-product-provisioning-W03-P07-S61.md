---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S61'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Align update command help and refusal outcomes with complete self-install and package-manager transaction authority

## Scope

- `engine/crates/vaultspec-cli/src/main.rs`

## Description

- The `update` command declares receipt-marked self-update help ("stop, update, relaunch") and refuses package-manager installs with their own remediation, in the CLI command surface.

## Outcome

The update command help text and refusal outcomes are authored and aligned with the self-install and package-manager transaction model.

## Notes

RESIDUAL — left UNTICKED: the help describes the self-install stop to update to relaunch flow whose `lifecycle.rs` cutover (S60) is deferred pending the un-gated drive. The package-manager refusal side is live and correct; the self-install completion rides the same distribution-authority-sealing gate as S60.
