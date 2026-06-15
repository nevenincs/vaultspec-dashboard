---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S24'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Add the measured promotion gate (projection time budget + cluster separation check)

## Scope

- `frontend/src/scene/field/semanticGate.ts`

## Description


## Outcome

Added `semanticGate.ts`: the measured promotion gate (projection wall time over a 1500-node ceiling slice vs a 250ms budget, AND a between/within cluster-separation ratio >= 1.2 on a labelled fixture). Verdict recorded in `SEMANTIC_MODE_GATE`.

## Notes

