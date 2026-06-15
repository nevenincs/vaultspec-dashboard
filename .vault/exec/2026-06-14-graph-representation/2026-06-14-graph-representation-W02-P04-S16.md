---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Encode derivation onto edge treatment via tokens

## Scope

- `frontend/src/scene/field/edgeMeshes.ts`

## Description


## Outcome

Added `DERIVATION_AXIS_ORDER` and `isLineageEdge` to `edgeMeshes` so derivation classifies a lineage edge and seeds the lineage axis WITHOUT introducing a competing edge colour (tier-as-treatment preserved).

## Notes

