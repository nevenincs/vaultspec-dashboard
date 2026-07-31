---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:9a1b4cb99c8b8d677d14dc99bc0c5d0421a968d19ba5b9edcd146b4709b9384d'
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
