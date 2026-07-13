---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S123'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add session tests for create, resume, cancelled run, joined active run, restart recovery, and bounded session listings

## Scope

- `engine/crates/vaultspec-api/src/authoring/session.rs`

## Description

- Add real SQLite session tests for create, replay, idempotency conflict, outbox dedupe, prompt turn start, active-run join, cancellation, store reopen recovery, resume/join, bounded listing, and session/run recovery snapshots.
- Add an HTTP router test proving session command success and missing-principal errors both carry `tiers`.
- Add proposal creation validation for unknown durable `session_id` values and cover the rejection with a real store test.
- Update proposal and HTTP test fixtures to seed durable session records before creating proposals.
- Update direct-write composition so the synthetic direct-write session is durable before it creates the backing proposal.
- Update store migration tests for schema version 13 and the new session/turn/run tables.
- Update stream recovery tests from the pre-W12 rejection contract to the W12 session snapshot contract.
- Run focused and broad Rust tests and the clippy warnings gate.

## Outcome

- Session behavior is covered by real store tests with no fakes, mocks, monkeypatches, skips, or shadow business logic.
- Create-session replay returns the recorded outcome and does not append duplicate lifecycle events.
- Same actor/key with a changed create-session payload fails as an idempotency conflict.
- Prompt-turn start creates one active run; a second prompt while active joins that run without creating another turn.
- Cancellation clears active state, persists through `Store::open_at`, and is visible through session snapshots and resume/join.
- Session listing enforces the requested cap, reports truncation, and returns a next marker.
- Proposal creation now fails loudly when the referenced session does not exist.
- Direct human editor-save remains compatible by creating a durable direct-write session before the composed proposal.
- `cargo test -p vaultspec-api authoring::session -- --nocapture` passed: 5 tests.
- `cargo test -p vaultspec-api session_route_success_and_principal_error_are_tiered -- --nocapture` passed: 1 test.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed: 318 tests.

## Notes

- One broad authoring test run timed out at 240 seconds and left a `cargo`, `vaultspec_api`, and workspace `vaultspec.exe` child; those stale test processes were stopped before rerunning with a longer timeout.
- The passing authoring test run still prints existing temporary-workspace watcher warnings from test fixtures after the test result; the selected tests passed.
