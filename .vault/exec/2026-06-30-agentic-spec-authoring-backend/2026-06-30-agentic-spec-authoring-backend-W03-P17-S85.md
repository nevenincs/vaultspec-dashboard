---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S85'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify proposal lifecycle transitions are idempotent and backend-owned through tests and manual command replay

## Scope

- `engine/crates/vaultspec-api/src/authoring/proposal.rs`

## Description

- Add lifecycle command replay coverage for validate, submit, cancel, and supersede.
- Assert replayed commands return recorded idempotency outcomes without duplicate ledger writes.
- Assert replayed receipts, outcome schema, aggregate identity, HTTP status, and serialized command payload match the original accepted outcome.
- Assert backend-owned final lifecycle statuses are reconstructed from the ledger after replay.
- Rerun focused proposal tests, authoring-wide tests, package-local clippy, and review.

## Outcome

S85 verifies proposal lifecycle transitions are idempotent and backend-owned
through real command replay. The replay test uses a real temporary worktree, the
real authoring store, real snapshot resolution, and the actual proposal command
handlers. Replayed validate, submit, cancel, and supersede commands return
recorded outcomes and do not append duplicate proposal revisions.

The S85 review found no critical, high, or medium blockers. A non-blocking
review suggestion to compare replayed outcome payloads was implemented before
closure and re-reviewed cleanly.

Verification passed:

- `cargo fmt -p vaultspec-api`
- `cargo test -p vaultspec-api authoring::proposal -- --nocapture`
- `cargo test -p vaultspec-api authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --all-targets --no-deps -- -D warnings`

## Notes

An initial focused test run hit a transient Windows linker lock on the test
binary; rerunning after the stale cargo process cleared passed. Full dependency
clippy remains blocked by unrelated local dependency warnings in `ingest-code`
and `engine-query`. The authoring-wide test slice passed while emitting the
existing temporary-workspace watcher and core graph diagnostics after the green
test result.
