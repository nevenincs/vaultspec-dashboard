---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement the Personalized PageRank partial-vector basis: a shared hub basis combined per biased teleport vector so per-lens vectors are cheap

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented the Jeh-Widom PartialVectorBasis: one precomputed PPR vector per authority-class hub, with combine() linearly blending them. Because PPR is linear in the teleport, a per-lens teleport (a convex blend of hubs) is a cheap combine, not a fresh power iteration. Linearity unit-proven.

Implemented the Jeh-Widom PartialVectorBasis: one precomputed PPR vector per authority-class hub, with combine() linearly blending them. Because PPR is linear in the teleport, a per-lens teleport (a convex blend of hubs) is a cheap combine, not a fresh power iteration. Linearity unit-proven.

## Notes
