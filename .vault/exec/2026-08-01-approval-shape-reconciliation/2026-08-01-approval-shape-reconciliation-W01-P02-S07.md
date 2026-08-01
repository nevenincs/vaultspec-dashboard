---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7790d5a19cda0a15acc867a181addf1def19bc4bef538a486240f9d7996aad0e'
step_id: 'S07'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Enforce the destructive floor inside review_decision_eligibility by reusing changeset_risk to refuse a non Human approver on a destructive changeset, with a test proving an agent reviewer is denied approving a destructive changeset

## Scope

- `engine/crates/vaultspec-api/src/authoring/approvals.rs`

## Description

- In `review_decision_eligibility`'s `Approve` arm, call the S06 shared `destructive_floor_eligibility` (collecting the changeset's operations from `current.children`) immediately after the existing `automated_self_approval_blocker` check, before `approve_transition_eligibility`.
- Add `agent_reviewer_distinct_from_proposer_is_denied_approving_a_destructive_changeset` to `approvals/tests.rs`: an agent reviewer DISTINCT from the proposing agent (so the pre-existing self-approval ban alone would allow it — asserted as an explicit precondition) is denied approving a `Rename` (destructive) changeset; a distinct HUMAN reviewer on the same changeset remains permitted.
- Add `destructive_child()`/`child_of()`/`changeset_record_with_child()`/`seed_needs_review_with_child()`/`seed_needs_review_destructive()` test helpers so the new test can seed a destructive-risk changeset without duplicating the existing non-destructive fixture builders.
- Demonstrate RED-before / GREEN-after by temporarily removing the new enforcement block, confirming the new test fails on `!outcome.eligibility.allowed` (i.e. the old code allowed the agent reviewer to approve), then restoring it and confirming the test passes.

## Outcome

RED before: with the destructive-floor block removed, `agent_reviewer_distinct_from_proposer_is_denied_approving_a_destructive_changeset` panics at the `!outcome.eligibility.allowed` assertion — the distinct agent reviewer's approval was allowed. GREEN after: with the block restored, the same test passes — the agent reviewer is denied with a reason containing "human", and a distinct human reviewer on the same changeset is still permitted. `cargo test -p vaultspec-api` passes 921/922 (one pre-existing, unrelated failure — see S06's exec record). `cargo fmt`/`cargo clippy --all-targets` clean for this crate.

## Notes

None.
