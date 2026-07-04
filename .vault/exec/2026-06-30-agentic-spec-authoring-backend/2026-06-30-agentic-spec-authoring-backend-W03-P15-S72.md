---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S72'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement changeset aggregate records, child operation records, target ordering, revision linkage, and audit-friendly identifiers

## Scope

- `engine/crates/vaultspec-api/src/authoring/ledger.rs`

## Description

- Add `authoring::ledger` with changeset revision inputs, aggregate records, child operation records, and history reconstruction.
- Compute order-sensitive aggregate digests and changeset revision tokens from aggregate metadata plus request-order child operation material.
- Persist append-only changeset revisions and ordered child operation rows through a `LedgerRepository` on the existing unit-of-work boundary.
- Add schema version 7 with `authoring_changeset_revisions` and `authoring_changeset_child_operations`.
- Add a bounded `query_collect` repository helper for ordered multi-row reads inside the transaction boundary.
- Validate duplicate child keys, non-empty children, non-empty summaries, non-negative timestamps, contiguous target ordering, and child-to-aggregate identity.
- Harden child keys through the shared authoring token policy and validate normalized ledger columns against stored JSON on read.
- Re-derive child base and current revision fences from the canonical target during reconstruction.

## Outcome

- Changeset revisions are append-only durable records keyed by `(changeset_id, changeset_revision)`.
- Child operation rows preserve request vector order through `target_order` and unique child keys per revision.
- History can be reconstructed from persisted revision and child rows without frontend memory or LangGraph checkpoints.
- Ledger reconstruction rejects split-brain records where normalized SQLite columns, aggregate JSON, child JSON, target JSON, or revision fences drift apart.
- The implementation stayed out of transition rules, proposal command handlers, approvals, apply, routes, streams, rollback execution, and core adapter calls.
- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 11 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 134 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- Events and head projections were not added in this phase. The source of truth is the append-only revision table plus ordered child rows; command and stream phases can add event/outbox projections later.
- No destructive git operation was used.
