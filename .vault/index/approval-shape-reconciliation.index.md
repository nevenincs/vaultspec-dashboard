---
generated: true
tags:
  - '#index'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:d81054bfeb4045cbfa0b3b7d670def82ae639dc98c1cac1caf3839753266d558'
related:
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S01]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S02]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S03]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S04]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S05]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-summary]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P02-S06]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P02-S07]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P02-S08]]'
  - '[[2026-08-01-approval-shape-reconciliation-adr]]'
  - '[[2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference]]'
  - '[[2026-08-01-approval-shape-reconciliation-plan]]'
---

# `approval-shape-reconciliation` feature index

Auto-generated index of all documents tagged with `#approval-shape-reconciliation`.

## Documents

### adr

- `2026-08-01-approval-shape-reconciliation-adr` - `approval-shape-reconciliation` adr: `one approval outcome, one enforced requirement, no second authority` | (**status:** `accepted`)

### exec

- `2026-08-01-approval-shape-reconciliation-W01-P01-S01` - Remove the origin_author field from CommandAuthorization, delete the review-authority clause from authorize_command, delete is_review_authority_command, and remove the test exercising the deleted clause
- `2026-08-01-approval-shape-reconciliation-W01-P01-S02` - Delete the now-orphaned reviewer_eligibility wrapper and its unit test since its only caller was the deleted review-authority clause
- `2026-08-01-approval-shape-reconciliation-W01-P01-S03` - Drop the origin_author parameter from run_authorization and its CommandAuthorization construction, and remove the trailing None argument from its own call site
- `2026-08-01-approval-shape-reconciliation-W01-P01-S04` - Drop the trailing None origin_author argument from the run_authorization call in the agent tool dispatch path
- `2026-08-01-approval-shape-reconciliation-W01-P01-S05` - Drop the trailing None origin_author argument from the route layer run_authorization call
- `2026-08-01-approval-shape-reconciliation-W01-P01-summary` - `approval-shape-reconciliation` `W01.P01` summary
- `2026-08-01-approval-shape-reconciliation-W01-P02-S06` - Add the ReviewerApprovalRequired variant to ApprovalRequirement, update the approval_requirement matrix so manual non-destructive yields it, and correct decision_reason and system_auto_approval_eligibility wording for the three way split
- `2026-08-01-approval-shape-reconciliation-W01-P02-S07` - Enforce the destructive floor inside review_decision_eligibility by reusing changeset_risk to refuse a non Human approver on a destructive changeset, with a test proving an agent reviewer is denied approving a destructive changeset
- `2026-08-01-approval-shape-reconciliation-W01-P02-S08` - Enforce the same destructive floor Human kind refusal at the apply preflight seam, with a test proving a distinct agent actor is denied applying an approved destructive changeset

### plan

- `2026-08-01-approval-shape-reconciliation-plan` - `approval-shape-reconciliation` plan

### reference

- `2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference` - `approval-shape-reconciliation` reference: `cross-repo approval shape inventory`
