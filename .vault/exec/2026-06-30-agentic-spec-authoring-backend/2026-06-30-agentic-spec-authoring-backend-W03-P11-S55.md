---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S55'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify apply and rollback inputs can recover exact preimages through tests and manual snapshot inspection

## Scope

- `engine/crates/vaultspec-api/src/authoring/snapshots.rs`

## Description

- Verify rollback recovery payloads rebuild target snapshots from stored full-document preimages.
- Verify direct SQLite preimage rows preserve document identity, base revision, blob hash, payload hash, exact text, byte length, and retention record reference.
- Verify retention rows classify preimages as rollback material, preserve payload bytes and content hash, and keep rollback available.
- Run focused and authoring-wide Rust tests after the review fix.

## Outcome

- Focused verification passed with `cargo test -p vaultspec-api authoring::snapshots -- --nocapture`: 11 tests passed.
- Authoring-wide verification passed with `cargo test -p vaultspec-api authoring -- --nocapture`: 91 tests passed.
- Manual snapshot inspection is represented by the direct SQL test `sqlite_snapshot_rows_preserve_exact_preimage_and_retention_metadata`, which bypasses repository reads and inspects the stored SQLite rows directly.

## Notes

- The environment does not provide a `sqlite3` CLI, so direct SQL inspection was executed through the Rust test using `rusqlite`.
- The authoring test target emitted existing temporary-workspace watcher warnings from unrelated tests, but all selected tests passed.
- No destructive git operation was used.
