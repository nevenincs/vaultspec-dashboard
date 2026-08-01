---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:30dbe8a10762edd86bf6cd042cd3eb0cb43a9f1acd1ed9826182cdfd58741f61'
step_id: 'S06'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add the ReviewerApprovalRequired variant to ApprovalRequirement, update the approval_requirement matrix so manual non-destructive yields it, and correct decision_reason and system_auto_approval_eligibility wording for the three way split

## Scope

- `engine/crates/vaultspec-api/src/authoring/policy.rs`

## Description

- Add `ApprovalRequirement::ReviewerApprovalRequired` alongside `HumanApprovalRequired` and `SystemAutoApprovable`, documenting the destructive-only enforcement scope of the human variant and the distinct-actor scope of the reviewer variant.
- Update `approval_requirement`'s matrix so `manual` mode over non-destructive risk yields `ReviewerApprovalRequired` instead of `HumanApprovalRequired`; destructive risk keeps `HumanApprovalRequired` in every mode.
- Add the shared `destructive_floor_eligibility(command, actor, kind, operations)` pure function, reusing `changeset_risk`, as the ONE reusable check both `authoring::approvals::review_decision_eligibility` (S07) and the `authoring::apply` preflight (S08) call — so served eligibility and enforcement can never drift.
- Split `system_auto_approval_eligibility`'s denial wording over the three-way requirement so a `ReviewerApprovalRequired` denial states the reviewer wording, not the human wording.
- Split `decision_reason` the same way so the manual non-destructive served reason reads "requires a decision by an authorized reviewer distinct from the proposer" instead of "requires an eligible human approval".
- Correct the stale `OperationMode::Manual` doc comment, which claimed every changeset needs a human approval under manual mode; it now states the distinct-reviewer requirement plus the destructive human floor.
- Update existing tests asserting the old manual+non-destructive `HumanApprovalRequired` expectation (`policy.rs` unit tests, `projections::tests`, `http::tests::group2::proposal_routes_serve_backend_policy_decision`'s served `"human_approval_required"` JSON literal) to the new `ReviewerApprovalRequired`/`"reviewer_approval_required"` expectation, and add new unit tests covering `destructive_floor_eligibility` and the reviewer-wording denial.

## Outcome

`ApprovalRequirement` is a three-way honest split; `approval_requirement` and `decision_reason` route non-destructive `manual` through the new reviewer variant; `destructive_floor_eligibility` exists as the one shared enforcement primitive S07/S08 both call. `cargo test -p vaultspec-api` passes 921/922 (the one pre-existing failure, `authoring::documents::tests::missing_documents_fail_loudly`, is verified unrelated — reproduces identically on a markdown-only commit from another in-flight session). `cargo fmt -p vaultspec-api -- --check` and `cargo clippy -p vaultspec-api --all-targets` are clean (zero warnings in this crate).

## Notes

None.
