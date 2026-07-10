---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S169'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Stream replay and generation retention code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run the W11.P34 code review with `vaultspec-code-review`.
- Dispatch two `vaultspec-code-reviewer` agents: one for durable replay/recovery semantics and one for route/status wire shape.
- Review `stream.rs`, `unit_of_work.rs`, authoring route mounting, status capability flags, S166-S168 execution records, and the accepted streaming-events/outbox ADR.
- Record the review findings and resolutions in the existing 2026-07-06 feature audit.
- Fix the review findings before closing the step.

## Outcome

- The review found and resolved one high issue: cursors ahead of the durable outbox high-water now emit an explicit `cursor_ahead_of_high_water` gap with latest and next recovery sequence.
- The review found and resolved one medium issue: SSE setup error frames now include a backend-served `tiers` block.
- The review found and resolved one low issue: `/v1/events` now uses `SubscribeEvents` command classification, while `/v1/recovery` keeps `RecoverEventStream`.
- The local review also hardened read-only authoring transactions with SQLite `query_only`, so read-command unit-of-work calls cannot accidentally commit repository writes.
- Audit entries were appended under `w11-p34-too-new-cursor-silent-empty`, `w11-p34-stream-error-not-tiered`, and `w11-p34-subscribe-command-classification`.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::stream -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::unit_of_work -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml --check`
- `git diff --check -- engine/crates/vaultspec-api/src/authoring/stream.rs engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`

## Notes

- The review agents reported no route/status capability mismatch and no W12 generation-channel scope creep.
- Focused Rust test runs emit pre-existing temporary watcher/core-tier diagnostics from `build_state` fixtures, but the targeted tests completed successfully.
