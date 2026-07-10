---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S103'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add policy tests for reviewer eligibility, stale validation, dangerous tool request, self-approval refusal, and request-changes loops

## Scope

- `engine/crates/vaultspec-api/src/authoring/policy.rs`

## Description

- Inspect the existing `authoring::policy` test module.
- Compare test coverage against the `S101` checklist for reviewer eligibility,
  stale validation, dangerous tool request, self-approval refusal, and
  request-changes loop representation.
- Run the focused policy test target.

## Outcome

The shared worktree already contained the `W10.P21.S103` test coverage:

- `operation_and_changeset_risk_classify_destructive_conservatively`
- `destructive_floor_holds_in_every_mode_and_nondestructive_follows_the_matrix`
- `session_override_narrows_only_never_widens`
- `reviewer_eligibility_refuses_agent_self_approval_but_permits_human_and_distinct`
- `system_auto_approval_requires_system_actor_and_auto_approvable_requirement`
- `dangerous_tool_request_needs_approval_readonly_is_auto_permitted`
- `request_changes_and_respond_are_represented_but_reserved_in_v1`
- `approval_stale_condition_classifies_validation_and_revision_staleness`
- `changeset_policy_decision_is_served_and_explains_the_requirement`

The tests cover the plan row's named cases and the extra `S101` policy
projection and narrowing-only requirements. No new test edit was needed in this
step because the coverage was already present and passing.

## Notes

Verification run for this step:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
  passed with 9 focused policy tests.
