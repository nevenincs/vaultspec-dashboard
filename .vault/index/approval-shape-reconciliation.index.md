---
generated: true
tags:
  - '#index'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:fd5148442e4d46d828f55579cfe4ead15c619e5e1a3e0b44712848c59a3823ba'
related:
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S01]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S02]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S03]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S04]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-S05]]'
  - '[[2026-08-01-approval-shape-reconciliation-W01-P01-summary]]'
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

### plan

- `2026-08-01-approval-shape-reconciliation-plan` - `approval-shape-reconciliation` plan

### reference

- `2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference` - `approval-shape-reconciliation` reference: `cross-repo approval shape inventory`
