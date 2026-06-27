---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add a salience module to engine-query exporting the per-lens scalar projection surface and its public types

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Added the salience module to engine-query (registered in lib.rs as `pub mod salience`) exporting the per-lens projection surface: Backbone, PartialVectorBasis, LensBasis, StructuralRole, AggregatedExec, the tier-weight functions, and the AuthorityClass + LifecyclePhase ontology seam. CPU-bound; no GPU dependency.

## Notes
