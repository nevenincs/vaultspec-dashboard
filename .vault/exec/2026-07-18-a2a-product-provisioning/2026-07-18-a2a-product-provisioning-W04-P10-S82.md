---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S82'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Declare the composite product identity and publisher for the WinGet package

## Scope

- `packaging/winget/vaultspec.vaultspec.yaml`

## Description

- Declared the composite product identity and publisher for the WinGet package (the version manifest, WinGet 1.6.0 schema).

## Outcome

The WinGet version/identity manifest is authored to schema.

## Notes

RESIDUAL — authored-PENDING-MSI: the WinGet channel installs the complete MSI (S76, deferred — WiX absent), and publication is a cross-repo PR to microsoft/winget-pkgs. Left UNTICKED.
