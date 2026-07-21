---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S74'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Install, verify, receipt, update, and remove the complete macOS and Linux product tree from the product-owned shell installer

## Scope

- `packaging/install.sh`

## Description

- Authored the product-owned shell installer for macOS and Linux: install (`--source` local-tree or `--version` fetch), verify the placed tree via `vaultspec verify-release`, note the receipt, update, and remove the complete product tree; `bash -n` clean.

## Outcome

The unix installer is authored and syntax-clean, mirroring the PowerShell installer proven on this box.

## Notes

RESIDUAL — a real macOS/Linux install lifecycle is not runnable on this Windows box; it is release/clean-machine-verified, and the receipt-establishing first-run rides S176 (distribution sealing). Left UNTICKED.
