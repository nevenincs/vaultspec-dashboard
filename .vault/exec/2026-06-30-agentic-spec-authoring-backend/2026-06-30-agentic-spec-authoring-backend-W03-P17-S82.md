---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S82'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement proposal creation, material append, draft replacement, validate, submit, supersede, cancel, and snapshot handlers

## Scope

- `engine/crates/vaultspec-api/src/authoring/proposal.rs`

## Description

- Add the crate-private `authoring::proposal` module for proposal command handlers.
- Implement route-free handlers for proposal creation, draft append, draft replacement, validation, submit-for-review, cancellation, supersession, and snapshot reads.
- Route every mutating handler through scoped idempotency inside one unit-of-work before ledger, validation, or preimage side effects.
- Materialize only the W03.P17 whole-document `replace_body` draft subset and store preimages before appending ledger revisions.
- Bind submit-for-review to the requested validation digest and to the latest aggregate revision's material and validation digests.
- Reuse stable preimage identities for repeated same-child materialization while rejecting changed document, base, or payload material.

## Outcome

S82 added the proposal command handler layer without exposing routes, approval,
apply, LangGraph, actor, operation-mode, or core-adapter behavior. The handlers
advance the existing lifecycle vocabulary through the transition engine and keep
proposal snapshots reconstructable from the ledger plus validation records.

Review found and resolved two S82 defects before closure: stale validation
digests could be selected by latest lookup instead of the requested digest, and
repeat same-child preimage capture needed stable identity plus timestamp-tolerant
payload equivalence to avoid the snapshot uniqueness collision. The final
follow-up review found no critical, high, or medium blockers.

Verification passed:

- `cargo fmt -p vaultspec-api`
- `cargo check -p vaultspec-api`
- `cargo test -p vaultspec-api authoring -- --nocapture`
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings`

## Notes

Dedicated proposal command tests are intentionally left to S83. The
authoring-wide test slice passed while emitting the existing temporary-workspace
watcher and core graph diagnostics after the green test result.
