---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:0255111aca00a8b60f673e0e875130c1c66c449f714565ef4171a778957e6eb0'
step_id: 'S31'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Rewrite the plan approval node to parse the verdict shape via the promoted helper instead of the approved boolean shape, and correct its docstring resume shape description

## Scope

- `src/vaultspec_a2a/graph/nodes/supervisor.py`

## Description

- `plan_approval_node` now parses its resume value via `parse_verdict` (imported from `.phase_gate`) instead of the old `resume_value.get("approved")` / `resume_value == "approve"` boolean-or-literal logic; approval is `verdict == VERDICT_APPROVED`.
- Retired the bare `"approve"` string fallback along with the boolean shape — a full cutover, no bridge, per D6.
- Corrected `create_plan_approval_node`'s docstring to describe the resume shape as `{"verdict": ..., "notes": ...}` and note that any unrecognised verdict (including the retired boolean shape) fails closed to revision.

## Outcome

The legacy plan gate now speaks the same verdict vocabulary as the document gate. Verified in S35.

## Notes

None.
