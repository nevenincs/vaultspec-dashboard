---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:03291bd26a30104eb7ca3cf494dca6f1c404a27ad4b53057389ce777cfc6a3dd'
step_id: 'S32'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Retire the approved boolean resume construction in favor of the verdict and notes shape for the locally respondable pause set, threading a new notes parameter through the respond service

## Scope

- `src/vaultspec_a2a/control/permission_service.py`

## Description

- `respond_to_permission` gained an optional `notes: str | None = None` parameter, threaded into `_record_permission_transition`.
- For a locally-respondable verdict-style pause, `resume_value` is now `{"verdict": ApprovalStatus.APPROVED.value | ApprovalStatus.REJECTED.value, "notes": notes}` (reusing the existing `ApprovalStatus` enum rather than importing `phase_gate`'s `VERDICT_*` constants, keeping the layering direction unchanged), retiring the `{"approved": option_id == "approve"}` construction.
- Updated `_PermissionTransition.resume_value`'s type annotation to `str | dict[str, str | None]`.

## Outcome

The legacy plan gate's resume payload and the document gate's resume payload are now the same shape end to end. Updated three pre-existing test assertions elsewhere in the suite (`api/tests/test_endpoints.py` x2, `api/tests/test_internal.py` x1) that asserted the retired `{"approved": True}` shape, since D6 is a full cutover with no bridge. Verified in S35/S36.

## Notes

None.
