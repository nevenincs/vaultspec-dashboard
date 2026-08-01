---
generated: true
tags:
  - '#index'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:8db9669e5197f3ed8c9241ff8f6bcff310ddda16385bad230e93d608d710939f'
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
  - '[[2026-08-01-approval-shape-reconciliation-W03-P06-S26]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P06-S27]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P07-S28]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P07-S29]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S30]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S31]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S32]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S33]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S34]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S35]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P08-S36]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P09-S37]]'
  - '[[2026-08-01-approval-shape-reconciliation-W03-P09-S38]]'
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
- `2026-08-01-approval-shape-reconciliation-W03-P06-S26` - Add a LOCALLY_RESPONDABLE_PAUSE_CAUSES set that excludes document_approval_request and correct the misleading comment on PLAN_APPROVAL_PAUSE_CAUSES to describe it as a projection and FSM classification rather than an answerability set
- `2026-08-01-approval-shape-reconciliation-W03-P06-S27` - Re export LOCALLY_RESPONDABLE_PAUSE_CAUSES alongside the existing pause cause export
- `2026-08-01-approval-shape-reconciliation-W03-P07-S28` - Refuse a respond call against a document approval pause with a typed error naming the engine review surface, before the idempotency and transition logic runs, and narrow the local branching in the transition and approval status blocks to the locally respondable set
- `2026-08-01-approval-shape-reconciliation-W03-P07-S29` - Add a test proving a respond call against a document_approval_request pause is refused and never constructs an approved boolean resume
- `2026-08-01-approval-shape-reconciliation-W03-P08-S30` - Promote the private verdict parsing helper to a public exported function so the legacy plan gate can reuse it instead of re deriving verdict parsing
- `2026-08-01-approval-shape-reconciliation-W03-P08-S31` - Rewrite the plan approval node to parse the verdict shape via the promoted helper instead of the approved boolean shape, and correct its docstring resume shape description
- `2026-08-01-approval-shape-reconciliation-W03-P08-S32` - Retire the approved boolean resume construction in favor of the verdict and notes shape for the locally respondable pause set, threading a new notes parameter through the respond service
- `2026-08-01-approval-shape-reconciliation-W03-P08-S33` - Add an optional notes field to the permission respond request schema
- `2026-08-01-approval-shape-reconciliation-W03-P08-S34` - Thread the request notes field into the respond service call
- `2026-08-01-approval-shape-reconciliation-W03-P08-S35` - Add a test proving the legacy plan gate now parses the verdict shape and no longer accepts the retired approved boolean shape
- `2026-08-01-approval-shape-reconciliation-W03-P08-S36` - Add a test proving the respond endpoint accepts an optional notes field and that it survives into the verdict resume payload
- `2026-08-01-approval-shape-reconciliation-W03-P09-S37` - Grep the codebase for any production call to the engine operation mode setting endpoint outside this acceptance test, confirm none exists, and record the finding as a durable comment marking this test the sole sanctioned caller
- `2026-08-01-approval-shape-reconciliation-W03-P09-S38` - Trace whether a mutating tool call can reach the Claude family auto approve first option branch under autonomy and record the reachability finding as a durable comment, changing no behaviour

### plan

- `2026-08-01-approval-shape-reconciliation-plan` - `approval-shape-reconciliation` plan

### reference

- `2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference` - `approval-shape-reconciliation` reference: `cross-repo approval shape inventory`
