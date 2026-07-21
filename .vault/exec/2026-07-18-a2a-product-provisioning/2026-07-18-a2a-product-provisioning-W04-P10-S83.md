---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S83'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Point WinGet only to the complete MSI with product scope, upgrade behavior, digest, and manager-owned rollback authority

## Scope

- `packaging/winget/vaultspec.vaultspec.installer.yaml`

## Description

- Pointed the WinGet installer manifest ONLY at the complete product MSI, with per-user product scope, upgrade behavior, a digest, and the manager-owned rollback WinGet provides (placeholder InstallerSha256 + ProductCode, reconciled when the MSI publishes); never the binary-only archive.

## Outcome

The WinGet installer manifest targets the complete MSI to schema.

## Notes

RESIDUAL — authored-PENDING-MSI (S76 deferred, WiX absent); the WinGet channel cannot publish or install until the complete MSI is built, and publication is a cross-repo PR. Left UNTICKED.
