---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S168'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add stream tests for replay, gaps, snapshot recovery, token retention caps, compacted transcripts, and frontend cursor restoration

## Scope

- `engine/crates/vaultspec-api/src/authoring/stream.rs`

## Description

- Add real SQLite-backed stream tests for replay after `last_seq`, restart recovery, explicit replay-window gaps, invalid negative cursors, tiered snapshot recovery, W12-deferred generation placeholders, and the mounted recovery route.
- Add a read transaction helper for read-only authoring commands so `recover_event_stream` can use the existing outbox and projection repositories without being classified as a mutating unit of work.
- Switch the lifecycle stream and recovery handlers to `with_read_unit_of_work(CommandKind::RecoverEventStream, ...)`.
- Keep generation/token retention assertions limited to the current W11 contract: generation channels are exposed only as non-authoritative placeholder metadata with cap `0`; the bounded runtime and transcript compaction remain in W12.P44.

## Outcome

- `authoring::stream` now has regression coverage for durable outbox replay, cursor gaps, snapshot-plus-next-sequence recovery, route mounting, and the non-authoritative generation placeholder.
- The tests caught and fixed the S167 read-command bug where stream recovery opened `RecoverEventStream` through `with_unit_of_work`, which rejects read-only commands.
- Focused verification passed:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::stream -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::unit_of_work -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::authoring_router_serves_the_list_read_through_the_middleware -- --nocapture`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`

## Notes

- The initial stream test run failed on assertion formatting for SSE debug output, then passed after matching the actual `Event` frame rendering.
- Frontend cursor restoration is represented here by the backend wire contract the frontend will consume: durable `last_seq` replay, explicit gap events, and recovery `next_seq`. Frontend store wiring remains outside this Rust-only step.
