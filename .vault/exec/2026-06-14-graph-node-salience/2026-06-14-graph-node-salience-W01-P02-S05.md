---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S05'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Implement sparse power-iteration PageRank over the weighted backbone with a configurable damping/teleport, returning the stationary distribution

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Implemented sparse power-iteration PageRank (damping 0.85, L1-delta convergence, dangling mass redistributed to the restart). Configurable teleport; returns the stationary distribution. O(edges) per iteration. Verified it sums to 1 and the hub outranks an isolated node.

## Notes

