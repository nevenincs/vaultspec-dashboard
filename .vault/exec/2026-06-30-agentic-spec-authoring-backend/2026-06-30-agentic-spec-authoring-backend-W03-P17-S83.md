---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S83'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add command tests for ordered revisions, replayed writes, validation gates, terminal refusal, supersession, and cancellation

## Scope

- `engine/crates/vaultspec-api/src/authoring/proposal.rs`

## Description

- Add real-behavior proposal command tests inside `proposal.rs`.
- Exercise ordered create, append, and replace ledger revision chains through the public command handlers.
- Verify idempotent create replay returns the recorded outcome without a second ledger write.
- Verify changed request material under the same idempotency key conflicts before a second write.
- Verify submit-for-review rejects missing, stale, older, and non-approval-ready validation digests.
- Verify submit-for-review accepts the latest approval-ready validation digest.
- Verify cancel and supersede append terminal records and later proposal mutations are refused.
- Verify proposal snapshots reconstruct history and latest validation from the backend store.

## Outcome

S83 expands the proposal command suite to seven tests using real temporary
worktrees, the real authoring SQLite store, real `SnapshotReader` and
`DocumentResolver` behavior, and real validation records. The tests do not use
fakes, mocks, stubs, monkeypatching, skips, xfails, or mirrored business logic.

The review cycle found and resolved two coverage gaps from the S81 grounding:
idempotency conflict plus backend snapshot reconstruction were added after the
first review, and non-approval-ready validation rejection was added after the
follow-up review. The final review found no remaining critical, high, or medium
blockers.

Verification passed:

- `cargo fmt -p vaultspec-api`
- `cargo test -p vaultspec-api authoring::proposal -- --nocapture`
- `cargo test -p vaultspec-api authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --all-targets --no-deps -- -D warnings`

## Notes

Full `cargo clippy -p vaultspec-api --all-targets -- -D warnings` remains blocked
by unrelated local dependency warnings in `ingest-code` and `engine-query`.
The authoring-wide test slice passed while emitting the existing
temporary-workspace watcher and core graph diagnostics after the green test
result.
