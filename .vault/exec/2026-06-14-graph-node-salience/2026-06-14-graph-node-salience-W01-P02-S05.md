---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:9102a7c725888b5658dced466e67aa92f0608b16717c9302e22e9040ae2a03c1'
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
