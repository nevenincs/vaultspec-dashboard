---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add a representationLayout dispatcher selecting connectivity vs lineage vs semantic

## Scope

- `frontend/src/scene/field/representationLayout.ts`

## Description

## Outcome

Added `representationLayout.ts` dispatcher mapping connectivity (null seed; FA2 owns positions), lineage (static derivation-axis seed), semantic (UMAP seed) and the default mode.

## Notes
