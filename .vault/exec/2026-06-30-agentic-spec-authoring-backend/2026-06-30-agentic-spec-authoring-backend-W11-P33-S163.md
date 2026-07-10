---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S163'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add event tests for session created, proposal updated, validation changed, approval resolved, apply recorded, rollback created, and version rejection

## Scope

- `engine/crates/vaultspec-api/src/authoring/events.rs`

## Description

- Add lifecycle event builder tests for the required session, proposal,
  validation, approval, and rollback event constructors.
- Add changeset-status mapping coverage for canonical proposal, approval, apply,
  rollback, conflict, and cancellation transitions.
- Add apply-recorded builder coverage for stable event identity, stable replay
  hash, and failed-apply event naming.
- Add projector-feed replay coverage over real persisted outbox rows after store
  restart.
- Add projector-feed schema-version rejection coverage using a persisted outbox
  event with an unsupported positive schema version.
- Re-run the changed apply and outbox test slices after adding event tests.

## Outcome

- `events.rs` now has five focused tests:
  `builders_cover_required_lifecycle_events_with_schema_wrapped_payloads`,
  `changeset_status_mapping_uses_canonical_transition_events`,
  `apply_recorded_builder_uses_stable_identity_and_hashes`,
  `projector_feed_replays_real_outbox_rows_after_restart`, and
  `projector_feed_rejects_unsupported_schema_versions`.
- Required S163 cases are covered: session created, proposal updated, validation
  changed, approval resolved, apply recorded, rollback created, and unsupported
  version rejection.
- Projector-feed coverage uses the real authoring store and transactional outbox
  repository. No mocks, stubs, monkeypatches, skips, or xfails were introduced.
- Existing apply and outbox behavior still passes after the event tests and
  shared event-builder integration.

Verification:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::events -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::outbox -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`

## Notes

- Event tests passed 5/5. Apply tests passed 12/12. Outbox tests passed 9/9.
- The test helpers construct real event inputs and append through the real store
  where persistence behavior is under test; they do not shadow event mapping or
  outbox behavior.
