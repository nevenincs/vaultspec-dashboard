---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:a331058cc2ca8f764bd85f7c284058d12034625c4bc4ace854eb076b6d1531de'
step_id: 'S01'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Remove the origin_author field from CommandAuthorization, delete the review-authority clause from authorize_command, delete is_review_authority_command, and remove the test exercising the deleted clause

## Scope

- `engine/crates/vaultspec-api/src/authoring/security.rs`

## Description

- Removed the `origin_author` field from `CommandAuthorization` and the review-authority clause it fed inside `authorize_command`.
- Deleted `is_review_authority_command`, now unreachable, and the `reviewer_eligibility` import it was the sole caller of.
- Deleted the `unauthorized_apply_of_own_proposal_is_denied` test, which exercised only the deleted clause.
- Dropped the now-invalid `origin_author: None` field from the three remaining test fixtures (`forbidden_document_scope_is_denied_as_a_value`, `stale_actor_is_denied_as_a_value_not_a_fault`, `allowed_delegated_command_authorizes_when_delegator_stands`).
- Corrected the module and struct doc comments: from FOUR guards to THREE, and a note that review authority is owned end to end by `policy::reviewer_eligibility` at the two live domain seams, not by this module.

## Outcome

The dead review-authority branch is gone; the self-approval ban stays live at its two real seams (`approvals::review_decision_eligibility`, apply preflight), untouched by this deletion. `authoring::security` unit tests: 5/5 passing (one fewer than before, the removed test).

## Notes

None.
