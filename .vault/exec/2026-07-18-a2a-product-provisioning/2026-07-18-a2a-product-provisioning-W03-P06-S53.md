---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S53'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Resolve interruption at every declared transaction boundary and recover staged, draining, snapshotted, activated, migrating, accepted, and rolling-back states deterministically from durable markers and complete receipts

## Scope

- `engine/crates/vaultspec-product/src/recovery.rs`

## Description

- Add the `recovery` module: deterministic interruption recovery resolving an interrupted update transaction from two durable authorities — the transaction descriptor phase (S52) and the fixed active-receipt journal (the commit authority).
- Add a pure, total `plan_recovery(phase, candidate_committed)` planner: a committed candidate (the receipt selects it) always rolls forward; otherwise the pre-snapshot phases (Staged/Draining) abort and the rest (Snapshotted/Migrating/Activated/Accepted/RollingBack) roll back.
- Add `recover(paths, guard)`: reproves the guard, reads the descriptor (absent → NoTransaction), joins it to the receipt journal via the read-only active-release observation to decide commit, and executes the action — roll forward (clear descriptor), roll back (restore the consistency snapshot then clear), or abort (clear). Idempotent, so a crash during recovery is resolved by re-running it. A recovery-required or unverifiable receipt journal cannot confirm a commit and conservatively rolls back.
- Expose `clear_descriptor` (pub(crate)) and add a test-support `persist_descriptor_for_test` in the transaction module so recovery can be proven at every declared boundary, including the downstream Activated/Accepted phases.
- Register `pub mod recovery` and add tests: exhaustive planner coverage across every phase × commit state, no-descriptor no-op, staged-abort, snapshotted/migrating roll-back restoring the group with idempotent re-run, and a committed-candidate roll-forward proven against a REAL settled receipt built through the manifest fixture and the S172 publisher.

## Outcome

Delivered `src/recovery.rs` (+ tests) and the two transaction-module accessors. Full product gate green: build, `cargo test -p vaultspec-product` (141 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

The roll-forward proof uses a real fixed-receipt commit (manifest fixture + `publish_active_receipt`), not a stub; the roll-back proof restores a real captured snapshot. The exhaustive per-durable-phase reopen against real transaction directories and receipts is completed by S56. No scaffolds or skipped work.
