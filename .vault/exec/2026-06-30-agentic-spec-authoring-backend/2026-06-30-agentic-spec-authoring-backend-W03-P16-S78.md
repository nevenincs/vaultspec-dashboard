---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S78'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add transition tests for illegal moves, terminal refusal, stale approval, cancelled run, rejected proposal, and rollback terminal states

## Scope

- `engine/crates/vaultspec-api/src/authoring/transitions.rs`
- `engine/crates/vaultspec-api/src/authoring/ledger.rs`

## Description

- Add tests for the review-to-approval-to-apply path and illegal direct status skips.
- Add terminal-state refusal tests for applied, rejected, superseded, failed, and cancelled changesets.
- Add submit-for-review validation freshness tests.
- Add approve/reject review-state tests and rejected-proposal apply refusal.
- Add apply freshness tests for stale proposal revision, target revisions, validation digest, policy version, cancelled run, and multi-child V1 refusal.
- Add rollback eligibility tests that preserve the applied source status and require rollback initial status.
- Add lifecycle-scope coverage for every command in the shared command vocabulary.
- Add apply completion coverage for applied, failed, and conflicted outcomes.
- Add draft mutation bypass coverage so review and rebase arcs remain explicit.
- Add real ledger persistence coverage rejecting illegal lifecycle status skips.
- Add real ledger persistence coverage rejecting multi-child apply start.
- Add reject freshness and rollback source-child mismatch coverage.
- Add ledger persistence coverage rejecting reviewed multi-child narrowing at apply start.
- Add ledger persistence coverage rejecting child-operation swaps at apply completion.

## Outcome

- `cargo test -p vaultspec-api authoring::transitions -- --nocapture` passed with 10 transition tests.
- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 15 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 148 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.
- Tests construct real authoring ledger records and value types rather than mirroring private transition tables.

## Notes

- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
