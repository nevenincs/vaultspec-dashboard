---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S73'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Retain Cargo Dist for target planning, checksums, and release hosting while disabling its binary-only shell, PowerShell, MSI, and updater outputs

## Scope

- `dist-workspace.toml`

## Description

- Configured Cargo Dist to retain target planning, checksums, and release hosting while disabling its binary-only shell, PowerShell, MSI, and updater installers (`installers = []`, `install-updater = false`), so the complete product artifacts come only from the separate product-release workflow.

## Outcome

Dist no longer emits binary-only installers; it is retained solely for planning, checksums, and release hosting.

## Notes

RESIDUAL — config authored; its effect is proven at a real release run. Left UNTICKED.
