---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:64e2a847dd8b5c68f3252795752def82b45e624c8b6b33cd52d5acf56727e253'
step_id: 'S34'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Thread the request notes field into the respond service call

## Scope

- `src/vaultspec_a2a/api/routes/gateway.py`

## Description

- Passed `notes=body.notes` into the `respond_to_permission` call in `run_permission_respond_endpoint`.

## Outcome

A caller's `notes` field on the wire request now reaches the resume payload dispatched to the worker. Verified in S36.

## Notes

None.
