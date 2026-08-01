---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:d51dc89481de6937aded66bef272de0c4f24f317fddfaaa42ad2712679df0594'
step_id: 'S08'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Enforce the same destructive floor Human kind refusal at the apply preflight seam, with a test proving a distinct agent actor is denied applying an approved destructive changeset

## Scope

- `engine/crates/vaultspec-api/src/authoring/apply/mod.rs`

## Description

- In `preflight_in_uow`, call the S06 shared `destructive_floor_eligibility` (collecting the changeset's operations from `latest.children`) immediately after the existing `automated_self_approval_blocker` check, before the lifecycle + approval-freshness + validation-status gate. A denial is classified `None` (unclassified `ApplyDenialKind`), matching the existing pattern for every other non-conflict, non-self-approval denial at this seam.
- Add `agent_actor_distinct_from_proposer_is_denied_applying_a_destructive_changeset` to `apply/tests/group1.rs`: reusing the existing `setup_live_rename()` fixture (a REAL git + vaultspec workspace, an approved single-child `Rename` changeset), register a new `agent:other` actor and apply as that actor — DISTINCT from the proposer (`fx.origin` = `agent:author`), so the pre-existing self-approval ban alone would allow it (asserted as an explicit precondition against `automated_self_approval_blocker`). The apply is denied at preflight before any core subprocess invocation, so no real-core dependency was added to this test.
- Demonstrate RED-before / GREEN-after by temporarily removing the new enforcement block, confirming the new test fails on `!outcome.eligibility.allowed`, then restoring it and confirming the test passes.

## Outcome

RED before: with the destructive-floor block removed, `agent_actor_distinct_from_proposer_is_denied_applying_a_destructive_changeset` panics at the `!outcome.eligibility.allowed` assertion — the distinct agent applier's apply was allowed. GREEN after: with the block restored, the same test passes — the agent applier is denied with a reason containing "human", no receipt is recorded, and the ledger status is not advanced to `Applied`. `cargo test -p vaultspec-api` passes 921/922 (one pre-existing, unrelated failure — see S06's exec record; a second, distinct real-core-subprocess test also flaked once under heavy concurrent build load from another session sharing this worktree's target directory, and was confirmed to pass cleanly when re-run in isolation, ruling out this change as the cause). `cargo fmt`/`cargo clippy --all-targets` clean for this crate.

## Notes

A second unrelated test, `authoring::http::tests::group1::direct_write_route_applies_a_rename_through_the_real_core`, failed once during a full-suite run under heavy concurrent build/test load from another session sharing this worktree's `CARGO_TARGET_DIR`; it does not touch `policy.rs`/`ApprovalRequirement`/`destructive_floor_eligibility` at all, and passed cleanly in an isolated re-run. Recorded here in case it recurs for a future session.
