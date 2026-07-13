---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S44'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add an engine benchmark measuring Brandes betweenness and the full basis precompute at the node ceiling, proving feasibility under MAX_GRAPH_NODES

## Scope

- `engine/crates/engine-query/benches/salience_bench.rs`

## Description

## Outcome

Added the salience feasibility benchmark (engine/crates/engine-query/benches/salience_bench.rs, harness=false). At the MAX_GRAPH_NODES ceiling (5000 nodes, 20000 edges): Brandes betweenness 2028ms, full lens-basis precompute (PPR partial vectors + Brandes + k-core + roles, one sweep) 2230ms, warm per-request salience compose 8ms. Proves betweenness is FEASIBLE under the ceiling - the basis cost is paid once per generation, the per-request cost is single-digit ms.

## Notes
