---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
step_id: 'S63'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove Windows can replace both the dashboard and installed updater only after the seated processes exit

## Scope

- `engine/crates/vaultspec-updater/tests/windows_replacement.rs`

## Description

- Rebuilt `engine/crates/vaultspec-updater/tests/windows_replacement.rs` around the real shape of the swap: BOTH installed executables — the dashboard and the updater beside it — are seated and running, and the replacement is driven by a copy taken out of the release through the production `copy_updater_out`, because the installed updater is one of the files being replaced.
- The copied updater runs as a real separate process for the whole drive, from outside the release. Its replacement attempt is refused for both installed images while the seated processes live, and both carry the new bytes once those processes have exited.
- The refusal is anchored by the test's own direct attempt against the running images, so a passing run cannot be an artifact of the helper's own bookkeeping.
- The Unix divergence note is retained: a running binary can be unlinked there, so the ordering is an OS-enforced property on Windows and a receipt-consistency requirement everywhere.

## Outcome

The two-image replacement ordering is proven end to end on Windows with real processes and real files. Commit `f2498b0e2b`. Gate at commit: `cargo fmt --check` exit 0, `cargo test -p vaultspec-updater --test windows_replacement` green on three consecutive runs.

## Notes

The seated images in the proof are copies of the test binary named `vaultspec.exe` and `vaultspec-updater.exe`. They are spawnable only because the crate now embeds the `asInvoker` manifest; without it the `vaultspec-updater.exe` copy would be escalated by Windows installer detection and the proof could not run.
