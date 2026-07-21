---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S157'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement the WinGet authority adapter by invoking only phase-zero-proven WinGet package and version commands for the complete MSI and never writing WinGet or Windows Installer-owned files

## Scope

- `engine/crates/vaultspec-product/src/channels/winget.rs`

## Description

- Add the WinGet channel adapter (`WinGetAuthority`): reports WinGet channel facts (manager ownership true), mints the sealed WinGet provenance, and exposes a CLOSED `WinGetOperation` set (install/upgrade/uninstall) authorized only against a phase-zero `ProvenManager` and a `PinnedArtifact` (the complete MSI) — no free-form WinGet command is representable and no WinGet- or Windows Installer-owned file is written here.
- Add unit tests: WinGet channel/provenance facts and closed-operation authorization producing the right descriptor bound to the proven manager and pinned artifact.

## Outcome

Delivered `src/channels/winget.rs` (+ tests) over the shared manager primitives introduced with S156. Full product gate green: build, `cargo test -p vaultspec-product` (129 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Landed in the same buildable slice as the Scoop (S156) and MSI (S158) sibling adapters. Actual delegation to WinGet is deferred to the external updater (W03.P07/W04) where the manager CLI contract is pinned; this step delivers the validated operation descriptors, sealed provenance, and phase-zero proven-manager gate. No scaffolds or skipped work.
