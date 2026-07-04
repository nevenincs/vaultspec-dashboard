---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S52'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement revision metadata reads, target snapshots, preimage capture, snapshot hashes, and recovery payloads

## Scope

- `engine/crates/vaultspec-api/src/authoring/snapshots.rs`

## Description

- Add revision metadata projection from full document snapshots without duplicating payload text.
- Add whole-document target snapshot hashing and integrity verification for future preview and apply inputs.
- Add snapshot recovery payload construction from stored preimages, including a rollback target snapshot built from the exact retained text.
- Add serde-compatible recovery structures while keeping chunk, section, stream, lease, LangGraph, and operation-mode concepts out of W03.P11.
- Fix the existing hash-mismatch recovery test so corruption preserves payload byte length and exercises the hash check.

## Outcome

- W03.P11 now has revision metadata reads, target snapshot values, durable full-document preimages, snapshot hash validation, and recovery payload construction in `snapshots.rs`.
- Focused verification passed with `cargo test -p vaultspec-api authoring::snapshots -- --nocapture`.

## Notes

- The implementation intentionally stores only rollback preimages in the authoring store. Operation target materialization records remain owned by the upcoming whole-document operations phase.
- No destructive git operation was used.
