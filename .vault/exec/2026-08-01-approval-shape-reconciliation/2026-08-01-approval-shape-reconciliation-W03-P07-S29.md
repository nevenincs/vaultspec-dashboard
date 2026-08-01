---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:bfe203a2c6ea3d7e1330ba0c5f90ac48c9b41c1005c4eac7964c12e6cb5da76a'
step_id: 'S29'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add a test proving a respond call against a document_approval_request pause is refused and never constructs an approved boolean resume

## Scope

- `src/vaultspec_a2a/control/tests/test_permission_rejection_journal.py`

## Description

- Added `test_document_approval_pause_is_refused_not_journalled` to `test_permission_rejection_journal.py`: seeds a durable `document_approval_request` pause, drives the real `respond_to_permission` against a real SQLite session, and asserts the result is refused with `error_status_code == 403`.
- Also asserts the response was never journalled — a fresh session finds no control action under the response's natural idempotency key — and that the permission row is left exactly `pending`, proving the retired `{"approved": bool}` resume was never constructed and no transition write occurred.

## Outcome

RED before the fix (proven live): `error_status_code == 502` — the unfixed route proceeded through authorization, transition, and dispatch, timing out against the unreachable fake worker, exactly the silent-reject defect the ADR describes. GREEN after S28 landed: `error_status_code == 403`, nothing journalled, permission still `pending`. Full file: 5/5 passing.

## Notes

None.
