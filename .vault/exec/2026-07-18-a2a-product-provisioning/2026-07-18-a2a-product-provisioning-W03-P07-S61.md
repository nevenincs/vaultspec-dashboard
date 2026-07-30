---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
step_id: 'S61'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Align update command help and refusal outcomes with complete self-install and package-manager transaction authority

## Scope

- `engine/crates/vaultspec-cli/src/main.rs`

## Description

- Replaced the `update` command's retired self-update help in `engine/crates/vaultspec-cli/src/main.rs` with the actual transaction authority: the dashboard copies the external updater out, writes a one-time owner-restricted handoff, stops the seat, and launches the copy, which holds the installation lock for the whole transaction rather than the running dashboard.
- Stated the package-manager side plainly in the same help: a manager owns the files it installed, so Scoop, WinGet, and Windows Installer copies update through their manager and the verb refuses rather than writing files it does not own.
- Deliberately did NOT branch the verb on a receipt channel enum. Install channel is a sealed adapter capability product-side (the receipt's channel accessor is crate-private by design), so a CLI that read and branched on it would be manufacturing exactly the fact the seal exists to protect.
- Added `engine/crates/vaultspec-cli/tests/channel_authority.rs`: the real `vaultspec` executable, copied into a directory holding nothing else, reports the refusal with its channel remediation, exits successfully (a channel refusal is an outcome, not a crash), and creates no product state.

## Outcome

Help and refusal describe the shipped behaviour, proven by a real-executable test. Commit `dee2dda08f`. Gate at commit: `cargo fmt --check` exit 0, `cargo test -p vaultspec-cli` green.

## Notes

The test file is named for the channel rather than the verb: a test binary whose name contains `update`, `install`, `setup`, or `patch` is escalated by Windows installer detection and cannot run at all. That trap cost a debugging cycle here and is recorded in the file itself.
