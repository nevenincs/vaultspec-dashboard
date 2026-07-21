---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S78'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Withdraw crates.io publication and bare Cargo installation metadata until a Cargo channel can preserve the composite release contract

## Scope

- `engine/crates/vaultspec-cli/Cargo.toml`

## Description

- Set `publish = false` on the dashboard CLI crate to withdraw crates.io publication and bare cargo-install metadata until a Cargo channel can preserve the composite release contract.

## Outcome

The CLI crate is marked unpublishable to crates.io.

## Notes

RESIDUAL — config authored; its effect is a release-time property. Left UNTICKED.
