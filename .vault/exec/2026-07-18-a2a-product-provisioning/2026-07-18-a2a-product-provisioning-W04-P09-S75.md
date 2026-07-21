---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S75'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Install, verify, receipt, update, and remove the complete Windows product tree from the product-owned PowerShell installer

## Scope

- `packaging/install.ps1`

## Description

- Authored the product-owned PowerShell installer for Windows: install (`-Source` local-tree or `-Version` fetch), verify the placed tree via `vaultspec verify-release`, note the receipt, update, and remove the complete Windows product tree.

## Outcome

The install + verify + remove lifecycle is PROVEN end-to-end on this Windows box: a real product tree placed via `-Source`, `verify-release` returned verified:true, re-verify, `-Uninstall` clean, and a tampered binary produced exit 1.

## Notes

RESIDUAL — left UNTICKED: the fetch (`-Version`) mode is release-verified, and the receipt-establishing first-run (S176) is distribution-authority-sealing-gated. The install/verify/remove core is locally proven; the full "receipt + update" claim rides those lanes.
