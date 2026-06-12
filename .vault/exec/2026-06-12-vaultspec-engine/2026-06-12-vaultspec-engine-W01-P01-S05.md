---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S05'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the store read and write API with single-writer discipline and concurrent-reader tests

## Scope

- `engine/crates/engine-store/src/lib.rs`

## Description

- Implement the writer API on `Store`: artifact put/get, event append returning seq, range query, semantic put/get/evict honoring TTL.
- Implement `ReadHandle` as a read-only-flagged connection sharing read paths with the writer via common helpers.
- Test single-writer discipline (read-only handle rejects writes at the connection level) and concurrent readers under WAL while the writer writes.

## Outcome

Single-writer, many-reader posture per ADR section 8: enforced by connection flags and the type system (Connection is not Sync), not convention. Six store tests pass including the four-thread concurrent-reader test.

## Notes

Timestamps are caller-supplied throughout (no clock reads inside the store), keeping the crate deterministic and testable. thiserror and tempfile (dev) added.
