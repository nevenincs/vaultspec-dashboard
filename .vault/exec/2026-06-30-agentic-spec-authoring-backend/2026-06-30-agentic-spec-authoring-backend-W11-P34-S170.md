---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S170'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify clients recover lifecycle truth after stream loss while token gaps remain non-authoritative

## Scope

- `engine/crates/vaultspec-api/src/authoring/stream.rs`

## Description

- Verify lifecycle replay after stream loss using durable outbox rows and `last_seq`.
- Verify restart recovery rebuilds lifecycle truth from the persisted outbox.
- Verify invalid, too-old, and ahead-of-high-water cursors produce explicit gap events with recovery metadata.
- Verify snapshot recovery returns a tiered envelope with `latest_outbox_seq` and `next_seq`.
- Verify token/generation channels remain non-authoritative placeholders in W11 and session/run recovery stays rejected before W12.P44.
- Verify read-only stream/recovery transactions cannot accidentally commit repository writes.

## Outcome

- Clients can recover lifecycle truth after stream loss through durable outbox replay or snapshot-plus-next-sequence recovery.
- Cursor failures are explicit: negative cursors, too-old cursors, and cursors ahead of the durable high-water mark all produce gap/error surfaces rather than silent empty truth.
- Generation/token gaps remain non-authoritative because W11 exposes only `implemented=false`, `cap=0`, and `authoritative=false`; full token retention and transcript compaction remain deferred to W12.P44.
- The stream route uses `SubscribeEvents`; the recovery route uses `RecoverEventStream`; both run through query-only read transactions.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::stream -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::unit_of_work -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`

## Notes

- Focused Rust tests emitted temporary watcher/core-tier diagnostics from scratch `build_state` fixtures, but all targeted tests completed successfully.
