---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-12'
step_id: 'S124'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Sessions prompt turns and recovery snapshots code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run the W12.P25 session, prompt-turn, run, recovery, and direct-write session
  integration review against the accepted plan and ADR constraints.
- Dispatch and reconcile a code-review sidecar for the session/runtime surface.
- Resolve the direct-write session lifecycle gap by publishing `session.created`
  for direct-write-created sessions in the same unit of work as session creation.
- Register session, prompt-turn, and run retention metadata so prompt history has
  an explicit retention class and compaction marker.
- Harden cancellation, session-list cursoring, and recovery error taxonomy.
- Record the S124 rolling audit findings and recommendations.
- Run focused session/direct-write tests, the broader authoring test slice, and
  clippy.

## Outcome

The W12.P25 review is recorded in the feature audit. The high review finding is
resolved: direct editor-save sessions now produce a durable session aggregate
`session.created` lifecycle event, and the real direct-write regression asserts
that event. Medium review findings for retention, cancellation dedupe, and
session-list cursoring are resolved in code and tests.

The `recovery.snapshot_served` event remains accepted and deferred. The current
recovery endpoint is a read-only `GET` opened through `RecoverEventStream` and
SQLite `query_only`; making it append outbox rows would violate the read-only
route contract. The audit records this as a future telemetry/audit-command
decision rather than product-state truth.

## Notes

- Verification:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::session -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::direct_write -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::direct_write::tests::human_direct_save_self_approves_captures_preimage_and_records_dual_run -- --nocapture`
  - `cargo clippy -p vaultspec-api --manifest-path engine/Cargo.toml --all-targets -- -D warnings`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- The broader authoring test run passed 318 tests. Several test-owned temporary
  `vaultspec serve` children logged watcher warnings after their temporary roots
  were removed; detached workspace test servers were stopped after the runs.
