---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:f65b9bc96c64fe5847499ac56d48de6829e0ffeb4066c1b2f60a8156b6278239'
step_id: 'S26'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add a LOCALLY_RESPONDABLE_PAUSE_CAUSES set that excludes document_approval_request and correct the misleading comment on PLAN_APPROVAL_PAUSE_CAUSES to describe it as a projection and FSM classification rather than an answerability set

## Scope

- `src/vaultspec_a2a/thread/snapshots.py`

## Description

- Added `LOCALLY_RESPONDABLE_PAUSE_CAUSES`, computed as `PLAN_APPROVAL_PAUSE_CAUSES - {"document_approval_request"}` — the subset the local respond route may resolve.
- Corrected `PLAN_APPROVAL_PAUSE_CAUSES`'s comment: it now states the set is a projection/FSM CLASSIFICATION (consumed by `projection.py`, `permission_fsm.py`, `thread_service.py`), not an answerability set, and cross-references the new narrower constant.
- Exported the new symbol in `__all__` (alphabetical position, before `PLAN_APPROVAL_PAUSE_CAUSES`).

## Outcome

Two constants now exist where one previously conflated classification with answerability: the broad set for the FSM/projection reading a pause's shape, and the narrow set for who may answer it locally.

## Notes

Judgment call recorded in the plan Description: kept `PLAN_APPROVAL_PAUSE_CAUSES`'s name and every existing call site outside `permission_service.py`, adding only the new narrower constant, rather than a full rename.
