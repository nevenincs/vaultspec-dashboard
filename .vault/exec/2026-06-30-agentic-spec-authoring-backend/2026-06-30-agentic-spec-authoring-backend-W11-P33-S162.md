---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S162'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement durable lifecycle event schemas, projector feed records, event versioning, and transition-to-event mapping

## Scope

- `engine/crates/vaultspec-api/src/authoring/events.rs`

## Description

- Add the durable lifecycle event module under the fenced authoring backend.
- Register the authoring event module from the authoring module tree.
- Define lifecycle event schema constants, aggregate kinds, event kinds, and the
  transition-to-event mapper from canonical changeset lifecycle state.
- Define a shared lifecycle event draft builder over the existing transactional
  outbox draft type.
- Define a projector-feed page and feed record that preserve outbox sequence,
  aggregate identity, schema version, actor, command, idempotency key, payload,
  payload hash, and high-water sequence.
- Add schema-version rejection for projector feed conversion.
- Move the apply completion outbox emission from ad-hoc event strings into the
  shared lifecycle event builder.
- Preserve the existing apply transaction boundary: the lifecycle event is still
  appended through the same unit of work that records the apply receipt.

## Outcome

- `events.rs` now owns the lifecycle event vocabulary for the current backend
  surface: sessions, runs, proposals, validation, approval, apply, conflicts,
  rollback, cancellation, failure, lease, and recovery events.
- The canonical event schema is `authoring.lifecycle_event.v1` with
  `schema_version = 1`.
- Apply no longer constructs `changeset.applied` or `changeset.apply_failed`
  directly. It emits `apply.recorded` for applied receipts and `apply.failed`
  for failed receipts through the shared builder.
- Lifecycle event payloads are wrapped with schema metadata and deterministic
  payload hashes before becoming durable outbox drafts.
- Projector-feed records are defined over persisted outbox events and reject
  unsupported schema versions instead of silently replaying unknown payloads.
- Existing API DTO fixtures were not rewired in this step; W11.P34 and later
  stream/recovery steps can adapt this internal feed to collaborator endpoints.

Verification:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::outbox -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api -- --nocapture`

## Notes

- The targeted apply test run passed 12 apply tests. The outbox run passed 9
  outbox tests. The API run passed 13 API tests.
- The API test run still prints the existing temp-workspace declared-tier and
  watcher warnings observed in earlier phases; assertions passed.
- S163 remains responsible for the dedicated event constructor, mapper,
  schema-version rejection, projector-feed replay, and apply-regression tests.
