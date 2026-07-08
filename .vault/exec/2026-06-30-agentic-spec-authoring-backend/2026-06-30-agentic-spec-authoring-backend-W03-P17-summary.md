---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W03.P17` summary

W03.P17 delivered the crate-private proposal command handler layer and its real
behavior test coverage.

- Created: `engine/crates/vaultspec-api/src/authoring/proposal.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`
- Modified: `.vault/audit/2026-06-30-agentic-spec-authoring-backend-audit.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W03-P17-S81.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W03-P17-S82.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W03-P17-S83.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W03-P17-S84.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W03-P17-S85.md`

## Description

The phase grounded proposal command requirements, implemented route-free command
handlers for create, append, replace, validate, submit, cancel, supersede, and
snapshot reads, and added real tests for ordered revisions, replayed writes,
idempotency conflict, validation gates, terminal refusal, supersession,
cancellation, backend snapshot reconstruction, and lifecycle replay.

The handlers stay within the S81 boundary: no routes, approval decisions, apply
jobs, rollback generation, actors or authorization policy, operation modes,
LangGraph runtime, review queues, streams, core adapter calls, direct `.vault`
writes, or new lifecycle vocabulary. Mutating handlers reserve idempotency
inside one unit-of-work before ledger, validation, or preimage side effects.

The review cycle resolved stale validation lookup, repeated preimage replay
collision, S81 coverage gaps for idempotency conflict and snapshot
reconstruction, missing non-approval-ready validation rejection, and replay
payload proof tightening. The final formal review found no critical, high, or
medium blockers.

Verification passed:

- `cargo fmt -p vaultspec-api`
- `cargo test -p vaultspec-api authoring::proposal -- --nocapture`
- `cargo test -p vaultspec-api authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --all-targets --no-deps -- -D warnings`

Known caveats: full dependency clippy remains blocked by unrelated local
dependency warnings in `ingest-code` and `engine-query`; authoring-wide tests
emit the existing temporary-workspace watcher and core graph diagnostics after
the green result. `proposal_snapshot` remains a non-mutating helper over
`UnitOfWork` until a later read transaction/helper exists.
