---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S54'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove consistency snapshots restore real SQLite primary and checkpoint stores together and reject incomplete or unverified groups

## Scope

- `engine/crates/vaultspec-product/tests/snapshot_group.rs`

## Description

- Add the consistency-snapshot integration proof using REAL SQLite primary and checkpoint databases and the production snapshot API (no fakes).
- Add `rusqlite` (bundled) as a dev-dependency — the version already used across the workspace; dev-only, so the shipped crate is unaffected.
- Prove a captured group restores both real databases together: seed real tables/rows, capture, mutate both databases (delete rows, drop a table), restore, reopen both with SQLite and assert the original rows.
- Prove an incomplete group (committed manifest removed) and a drifted member (captured bytes tampered) are both rejected on reopen.

## Outcome

Delivered `tests/snapshot_group.rs` (3 tests) + the dev-dependency. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Uses default SQLite journal mode with the connection closed before capture, so the byte-level snapshot of the quiesced store is a real consistent snapshot; the SQLite `-wal`/`-shm` sidecar capture/restore path is proven in the snapshot unit tests. No fakes, no skips.
