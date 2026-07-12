---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the plan-step set-state core capability invoking vault plan step check/uncheck with JSON output, an output cap and wall-clock timeout, confirming or widening the status vocabulary against the adapter success set

## Scope

- `engine/crates/vaultspec-session/src/authoring/core_adapter.rs`

## Description

- Add two project-pinned capabilities to the internal core adapter's `CoreCapability` registry: `CheckPlanStep` (`vault plan step check`) and `UncheckPlanStep` (`vault plan step uncheck`), each with fixed verb args and a semantic audit label (`close-plan-step` / `open-plan-step`).
- Add a dedicated `CoreInvocation::set_plan_step_state(check, plan_ref, step_id)` builder assembling the positional argv `plan step check|uncheck <plan_ref> <S##>` — deliberately carrying NO `--expected-blob-hash` flag (the plan CLI has none) and no stdin body.
- Add a `validate_step_id` argv-boundary validator accepting only canonical `S` + digits step ids; reuse `validate_doc_ref` for the plan ref so traversal/flag-shaped inputs fail before any spawn.
- Confirm the plan verb's `--json` status vocabulary against the adapter's `is_success` set by running the CLI against a scratch fixture plan.

## Outcome

- Status-vocabulary finding: a real state flip emits `status: "updated"`; an idempotent re-check/re-uncheck emits `status: "unchanged"` — BOTH already in the adapter's existing `is_success` set (`created | updated | unchanged`), so NO widening was needed. A business refusal (unknown step id) emits `status: "failed"`, handled by `is_failed` as a recorded failure. A bad plan path is a click usage error (exit 2, no envelope) surfacing as the existing `CoreFailed`, but the direct-write path resolves the plan document first, so that case never reaches the invocation.
- The plan verbs are NOT in the `is_write` set: the generic write builder (which appends flags including `--expected-blob-hash`) rejects them, and the dedicated builder is the only construction path.
- Three focused unit tests added (positional-argv-without-blob-fence, malformed-step-id/traversal rejection, status-vocabulary mapping). Full `cargo test -p vaultspec-api --lib authoring::core_adapter` is green (21 passed).

## Notes

- The plan attributed this file to `vaultspec-session`; the authoring module actually lives in the `vaultspec-api` crate. Implemented in `vaultspec-api`.
- Foreign-lane unblock: the parallel comments phase (`W01.P02`) had added a `StoreError::Comment` variant without its error-mapping arm, breaking the whole crate's compile. Added a minimal `authoring_comment_refused` 422 arm in the authoring HTTP command-error map so the crate compiles; the comments lane can refine it. Flagged for the reviewer.
