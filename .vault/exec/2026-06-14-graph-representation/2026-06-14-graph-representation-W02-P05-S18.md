---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add a pure lineage DAG ordering module (derivation-axis longest-path layering)

## Scope

- `frontend/src/scene/field/lineageLayout.ts`

## Description

## Outcome

Added `lineageLayout.ts`: pure longest-path layering along the PROV derivation axis (research->adr->plan->exec->audit) from derivation edge labels; cycle-safe; deterministic ordering.

## Notes
