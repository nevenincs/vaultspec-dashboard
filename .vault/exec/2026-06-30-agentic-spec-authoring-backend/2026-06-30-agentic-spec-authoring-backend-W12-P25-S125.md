---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S125'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify refreshed clients recover session and run state from backend snapshots

## Scope

- `engine/crates/vaultspec-api/src/authoring/session.rs`

## Description

- Verify active prompt-turn run state survives store reopen and can be read from
  a backend-owned session snapshot.
- Verify recovery snapshots can be addressed by session id or run id without
  relying on frontend memory or LangGraph checkpoints.
- Verify `/authoring/v1/recovery` serves session and run state after W12 instead
  of rejecting the `session_id` and `run_id` recovery parameters.
- Confirm the S124 hardening remains green under the broader authoring test
  slice and clippy.

## Outcome

Refreshed clients can recover the W12.P25 session state from backend-served
snapshots. The verified paths cover a restarted store reading the active run,
bounded session/run/turn snapshot recovery by session or run id, and the
recovery route returning the session snapshot in the shared authoring snapshot
payload.

This closes the W12.P25 phase scope. LangGraph runtime mapping, interrupt-value
resume, tool aliases, generation token channels, leases, and conflict/rebase
behavior remain deferred to later phases.

## Notes

- Verification:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::session::tests::prompt_turn_joins_active_run_cancel_survives_restart -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::session::tests::recovery_snapshot_can_be_read_by_session_or_run -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::stream::tests::recovery_serves_session_snapshot_after_w12 -- --nocapture`
  - S124 regression context also passed `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
  - S124 regression context also passed `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- The recovery route still treats lifecycle truth as backend product state and
  durable outbox replay, not as LangGraph checkpoint state.
