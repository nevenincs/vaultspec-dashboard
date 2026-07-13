---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Enroll the set-plan-step-state changeset operation kind and materializer with the engine-side stale-base concurrency fence and a core-authoritative post-verify that re-reads the resulting step state

## Scope

- `engine/crates/vaultspec-api/src/authoring/apply.rs`

## Description

- Add the `SetPlanStepState` variant to the `ChangesetOperationKind` enum and the exhaustive-match arms it forces: the operation-kind label map in `ledger.rs` (`set_plan_step_state`) and the risk classifier in `policy.rs` (non-destructive — a checkbox tick changes no identity and loses no data).
- Add the wire payload types in `api.rs`: `PlanStepEdit` (canonical step id + desired state) and the `PlanStepState` enum (`checked`/`unchecked`), plus a `plan_step` field on `DraftMutation` (the per-kind payload channel, absent for every other kind).
- Add `materialize_set_plan_step_state` in `operations.rs`: like the rename materializer, the preview text is the base UNCHANGED (the plan tick is core-authoritative over the resulting bytes, so there is nothing to diff), carrying the validated `PlanStepEdit` through the new `plan_step_edit` payload on `MaterializedProposalOperation`; add the draft validator (kind, whole-document mode, empty body, canonical `S##` id, shared target/preimage fence).
- Wire the materialize dispatch arm in `proposal.rs`.
- In `apply.rs`: admit `SetPlanStepState` to the apply gate; add an early-return arm in `build_write_invocation` building the dedicated core invocation with NO expected-blob-hash; add the `PostVerifyExpectation::PlanStepState` variant plus its `post_verify_expectation` arm; add the `post_state_resolution` arm that re-reads the plan text and parses the named step's `done` with `ingest_struct::plan_structure::parse_plan_structure`, failing closed.

## Outcome

- The concurrency fence is engine-side, as the ADR D1 constraint requires: the plan CLI carries no expected-blob-hash, so the apply invocation omits it and correctness rests on the direct-write stale-base pre-check (S03) plus the apply preflight's conflict detector. The apply-time post-verify never compares a blob hash — it re-reads the resulting step state with the SAME parser that serves the projection's `done`, so post-verify and a later projection read agree by construction.
- The rollback path (`rollback.rs`) reaches the plan tick only through its whole-document preimage-restore default arm; a dedicated check/uncheck inverse is out of W01.P01 scope (flagged for the reviewer). The rebase carry-forward gate already denies non-replace/rename kinds, so a plan tick is honestly non-rebaseable.
- Full authoring lib suite green (537 passed, including the pre-existing real-core apply/rename/frontmatter/section tests), clippy and fmt clean.

## Notes

- A new enum variant rippled through 52 `DraftMutation` struct literals (the same fan-out the `section_selector` field caused when it was added); all now carry `plan_step: None`, applied by a scripted insertion after each literal's trailing `section_selector` line and verified by a clean compile.
- Rollback of a plan tick currently falls through to a whole-document preimage restore rather than an explicit check/uncheck inverse; correct-ish (it restores pre-tick bytes) but not the honest inverse. Reviewer should decide whether to gate it as unavailable pending a follow-on.
