---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S165'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify lifecycle projections rebuild from durable events and not transient generation chunks

## Scope

- `engine/crates/vaultspec-api/src/authoring/events.rs`

## Description

- Verify lifecycle feed reconstruction from persisted outbox rows after store
  restart.
- Verify `events_after` replay and latest outbox high-water are preserved in the
  projector-feed page.
- Verify unsupported future schema versions and malformed same-version v1 rows
  are rejected before becoming lifecycle feed records.
- Verify apply emits durable lifecycle rows for both start and terminal recorded
  transitions.
- Verify the real apply-emitted lifecycle payloads do not carry transient
  generation/token/debug/chunk stream fields.
- Re-run the outbox repository tests to preserve transaction, ordering, restart,
  duplicate, and worker-claim invariants.

## Outcome

- `projector_feed_replays_real_outbox_rows_after_restart` proves feed rebuild
  from durable outbox rows after reopening the store.
- `projector_feed_rejects_unsupported_schema_versions` and
  `projector_feed_rejects_malformed_same_version_lifecycle_rows` prove replay is
  schema- and vocabulary-aware instead of treating arbitrary v1 rows as lifecycle
  truth.
- `approved_changeset_materializes_once_and_records_an_applied_receipt` now
  proves a canonical apply produces `apply.started` then `apply.recorded` and
  that the durable payloads omit transient `token`, `debug`, `chunk`, and
  `generation` data.
- Existing ledger-backed apply behavior and transactional outbox invariants
  still pass.

Verification:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply::tests::approved_changeset_materializes_once_and_records_an_applied_receipt -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::events -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::outbox -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`

## Notes

- Event tests passed 6/6. Apply tests passed 12/12. Outbox tests passed 9/9.
- This step intentionally stops before SSE transport, stream route shape,
  frontend cursor replacement, and LangGraph runtime wiring; those remain later
  binding plan rows.
