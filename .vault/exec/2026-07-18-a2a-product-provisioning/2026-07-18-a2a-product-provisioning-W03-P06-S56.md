---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S56'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove crash recovery from every durable transaction phase by reopening real transaction directories and receipts

## Scope

- `engine/crates/vaultspec-product/tests/interruption_recovery.rs`

## Description

- Add the interruption-recovery integration proof: drive a real transaction to a durable phase, "crash" it (drop the transaction and its installation guard, as on process death, freeing the OS lock), acquire a FRESH guard as a restarted process would, and run recovery — which reopens the real transaction directory and receipt journal.
- Prove crash recovery from every phase reachable through the public transaction API: Staged and Draining abort (nothing durable mutated), Snapshotted and Migrating roll back the real SQLite store to its captured state, and a no-descriptor product is a no-op.
- Prove recovery is idempotent (a second recovery after a roll-back finds nothing to do).

## Outcome

Delivered `tests/interruption_recovery.rs` (5 tests) over real SQLite + real transaction directories/receipts. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Integration tests see only the public crate API, which cannot forge a descriptor at the downstream `Activated`/`Accepted` phases or publish a committed receipt (those require the sealed activation). The recovery decision for EVERY durable phase, including committed roll-forward at `Activated`/`Accepted`, is proven exhaustively in the S53 unit tests (which use the crate-internal descriptor writer and a real fixed-receipt commit via the manifest fixture); this integration step reopens real directories/receipts for every publicly-reachable phase. End-to-end integration of the committed roll-forward completes when the sealed activation lands (W03.P07/W04). No fakes, no skips.
