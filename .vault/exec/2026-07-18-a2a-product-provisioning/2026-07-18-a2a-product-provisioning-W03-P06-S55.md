---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S55'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove candidate failure restores files, all schema-bearing state, checkpoints, complete receipt generation, and prior seat while successful activation cannot leave a split release set

## Scope

- `engine/crates/vaultspec-product/tests/update_transaction.rs`

## Description

- Add the update-transaction integration proof using the production transaction API, REAL SQLite databases, and a real spawned owned-runtime child (resolved through the public capsule-relative program authority) — no fakes.
- Drive a real transaction begin → drain-and-stop → snapshot, then corrupt every mutable store (delete rows, drop a table), the fixed receipt-journal generation, and hit a REAL migration spawn failure.
- Prove the candidate failure restores the whole consistency group together — both real SQLite databases (files + all schema-bearing state + checkpoints), the fixed receipt-journal generation, and the retained prior seat — and clears the durable descriptor, so no split release set is left behind.

## Outcome

Delivered `tests/update_transaction.rs` (1 comprehensive proof) over real SQLite + a real child. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

The "successful activation cannot leave a split release set" half is the fixed active-receipt journal's atomic single-selection property, which is proven in the receipt (S172) tests and, at the integration level, becomes end-to-end provable once the sealed activation (materializer + public publish) lands (W03.P07/W04). This step proves the candidate-FAILURE rollback fully against real state. No fakes, no skips.
