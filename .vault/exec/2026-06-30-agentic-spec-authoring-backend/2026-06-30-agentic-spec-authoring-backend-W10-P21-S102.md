---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S102'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement approval policy matrix, freshness checks, reviewer eligibility, tool permission gates, and policy reason projection

## Scope

- `engine/crates/vaultspec-api/src/authoring/policy.rs`

## Description

- Inspect the existing `authoring::policy` module discovered by
  `vaultspec-rag`.
- Compare the implementation against the `S101` approval-policy checklist and
  the accepted operation-modes, approval-gates, and security-provenance ADRs.
- Verify the module is registered from `authoring::mod`.
- Run the focused `authoring::policy` Rust tests.

## Outcome

The shared worktree already contained the `W10.P21.S102` implementation, and it
matches the binding checklist:

- Defines `OperationMode` with `manual`, `assisted`, and `autonomous`; `manual`
  is the default.
- Resolves per-scope mode plus optional session override with narrowing-only
  behavior.
- Classifies operation and changeset risk, including a fail-closed empty
  operation set and rollback-as-destructive-by-kind.
- Enforces the destructive-operation human-approval floor in every mode.
- Computes non-destructive approval requirements as human-gated in `manual` and
  system-auto-approvable in `assisted` and `autonomous`.
- Reuses `automated_self_approval_blocker` from the approval layer for reviewer
  eligibility instead of duplicating the agent self-approval rule.
- Represents system auto-approval as a policy eligibility fact only; execution
  stays deferred to `W10.P48`.
- Separates tool permission policy from changeset approval.
- Classifies approval stale conditions from `ApprovalFreshness`.
- Serves `PolicyDecisionProjection` with denied unknown fields and a backend
  reason.

No code edit was needed in this step because the implementation was already
present and aligned to the regrounded plan.

## Notes

Verification run for this step:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
  passed with 9 focused policy tests.
