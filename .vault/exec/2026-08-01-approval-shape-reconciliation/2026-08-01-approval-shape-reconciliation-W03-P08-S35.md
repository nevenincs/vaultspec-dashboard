---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b21acc14d4b1b68f0856c29341bc9ebd2ec2b13b3284660626feae55406c17bc'
step_id: 'S35'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add a test proving the legacy plan gate now parses the verdict shape and no longer accepts the retired approved boolean shape

## Scope

- `src/vaultspec_a2a/graph/tests/nodes/test_supervisor.py`

## Description

- Updated three existing graph-level resume assertions from the retired `Command(resume={"approved": True/False})` shape to `Command(resume={"verdict": "approved"/"rejected"})`.
- Added `test_plan_approval_node_no_longer_accepts_retired_approved_boolean`: resumes an in-flight plan-approval interrupt with the OLD `{"approved": True}` shape and asserts it is now read as unrecognised (no `"verdict"` key) and fails closed to revision — `next == "vaultspec-plan-author"`, `approval_status == "rejected"` — rather than being treated as an approval.

## Outcome

Proves the D6 cutover is real, not just present in new code: the retired shape provably no longer approves anything. Full file: 29/29 passing.

## Notes

None.
