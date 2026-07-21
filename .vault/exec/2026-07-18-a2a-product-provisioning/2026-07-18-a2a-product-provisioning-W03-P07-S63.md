---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S63'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove Windows can replace both the dashboard and installed updater only after the seated processes exit

## Scope

- `engine/crates/vaultspec-updater/tests/windows_replacement.rs`

## Description

- Proves the Windows replace-only-after-exit timing property against real files: a running executable image cannot be removed or overwritten while a process is alive on it, and can be once that process exits — the OS property that makes the seat-and-updater-exit-before-replacement ordering necessary.

## Outcome

The standalone timing property is proven on Windows with real executables, tests green.

## Notes

RESIDUAL — left UNTICKED: the end-to-end swap of the actual dashboard and installed updater is the activation seam (materializer) drive, whose full-production Windows run is distribution-authority-sealing-gated. This record covers the timing property only; the full swap rides the same residual as S62.
