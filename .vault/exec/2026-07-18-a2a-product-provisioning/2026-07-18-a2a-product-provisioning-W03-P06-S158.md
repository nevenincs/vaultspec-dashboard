---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S158'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement the MSI authority adapter by delegating install, upgrade, downgrade, rollback, repair, and removal to Windows Installer with candidate and retained prior product packages and never rewriting installer-owned files

## Scope

- `engine/crates/vaultspec-product/src/channels/msi.rs`

## Description

- Add the MSI (Windows Installer) channel adapter (`MsiAuthority`): reports MSI channel facts (manager ownership true — the Windows Installer owns activation and rollback), mints the sealed MSI provenance, and exposes the CLOSED `MsiOperation` set — install, upgrade, downgrade, rollback, repair, and remove — authorized only against a phase-zero `ProvenManager` and a `PinnedArtifact` (a candidate or retained-prior product package). No free-form installer command is representable and no installer-owned file is rewritten here.
- Add unit tests: MSI channel/provenance facts and authorization of the full closed installer operation set, each producing the right descriptor.

## Outcome

Delivered `src/channels/msi.rs` (+ tests) over the shared manager primitives introduced with S156. Full product gate green: build, `cargo test -p vaultspec-product` (129 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Landed in the same buildable slice as the Scoop (S156) and WinGet (S157) sibling adapters. Delegation to the Windows Installer (install/upgrade/downgrade/rollback/repair/removal) is deferred to the external updater (W03.P07/W04) where the installer contract is pinned; this step delivers the validated operation descriptors, sealed provenance, and phase-zero proven-manager gate. No scaffolds or skipped work.
