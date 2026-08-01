---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7000bbcc48640674e1953a6dab1e8e390f8c27b1a7836375756c11040eed3b91'
step_id: 'S27'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Re export LOCALLY_RESPONDABLE_PAUSE_CAUSES alongside the existing pause cause export

## Scope

- `src/vaultspec_a2a/thread/__init__.py`

## Description

- Re-exported `LOCALLY_RESPONDABLE_PAUSE_CAUSES` from `thread/snapshots.py` alongside the existing `PLAN_APPROVAL_PAUSE_CAUSES` re-export.
- Added the symbol to the package `__all__` list.

## Outcome

`control/permission_service.py` can import the new constant through the `thread` package, matching how it already imports `PLAN_APPROVAL_PAUSE_CAUSES`.

## Notes

None.
