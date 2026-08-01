---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:e1859e0a499f75d94e74803bd62e12ebf997d6e6e23fa2d1ec77632793dec734'
step_id: 'S28'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Refuse a respond call against a document approval pause with a typed error naming the engine review surface, before the idempotency and transition logic runs, and narrow the local branching in the transition and approval status blocks to the locally respondable set

## Scope

- `src/vaultspec_a2a/control/permission_service.py`

## Description

- Added a new guard in `_authorize_permission_response`, between resolving the permission/thread (step 1) and idempotency dedup (step 2): if `pause_reason_type` is in `PLAN_APPROVAL_PAUSE_CAUSES` but not in `LOCALLY_RESPONDABLE_PAUSE_CAUSES` (i.e. it is `document_approval_request`), the call returns immediately with `error_status_code=403` and an `error_detail` naming the engine review surface as the deciding authority.
- The guard runs before idempotency-key resolution, so it never journals a control action and never touches the transition or dispatch stages — no DB write happens at all for a refused call.
- Narrowed every remaining `PLAN_APPROVAL_PAUSE_CAUSES` branch in the file (the active-interrupt guard, the resume-value/approval-state stamping in `_record_permission_transition`, and the final `approval_status` in `_dispatch_permission_resume`) to `LOCALLY_RESPONDABLE_PAUSE_CAUSES`.

## Outcome

A respond call against a `document_approval_request` pause can no longer reach the transition/dispatch pipeline at all; it fails fast at 403 before any state changes. Verified in S29.

## Notes

None.
