---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S167'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement stream subscriptions, last-sequence replay, gap events, snapshot recovery, bounded generation channels, and transcript compaction hooks

## Scope

- `engine/crates/vaultspec-api/src/authoring/stream.rs`

## Description

- Add the `stream.rs` authoring module.
- Register the stream module from the fenced authoring module tree.
- Mount `/authoring/v1/events` and `/authoring/v1/recovery` under the authoring
  V1 router.
- Implement bounded lifecycle replay from the durable transactional outbox using
  `events_after(last_seq, max_rows)` and `latest_seq()`.
- Serialize replayed lifecycle rows through the `events.rs` projector-feed record
  shape.
- Emit explicit `gap` SSE events when a requested cursor exceeds the bounded
  replay page.
- Implement recovery as a tiered authoring snapshot with latest/next outbox
  sequence and backend-served proposal projection state.
- Add bounded generation-channel placeholder metadata so generation data remains
  non-authoritative until W12.P44.
- Mark authoring status `streams` capability true once the routes are mounted.

## Outcome

- `stream.rs` now exposes lifecycle SSE replay and snapshot recovery without
  depending on in-memory broadcast state for lifecycle truth.
- `/authoring/v1/events?last_seq=N` returns finite SSE replay events named
  `lifecycle`, or an explicit `gap` event when the bounded replay page cannot
  satisfy the requested cursor.
- `/authoring/v1/recovery?last_seq=N` returns the shared tiered response
  envelope, latest outbox sequence, next sequence, requested cursor, proposal
  projection snapshot, and non-authoritative generation-channel placeholder.
- Recovery rejects negative cursors and session/run recovery requests before
  W12 with typed tiered errors.
- Full generation/token channel runtime remains deferred to W12.P44, as recorded
  in S166.

Verification:

- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml --check`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`

## Notes

- S168 remains responsible for the real-behavior stream/recovery tests and route
  assertions.
