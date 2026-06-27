---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement rank-normalization of each criterion to [0,1] within the bounded served subgraph, robust to the heavy tails of PageRank and betweenness

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented rank_normalize to [0,1] within the bounded subgraph using RANK not magnitude (ties share the average rank), robust to the heavy tails of PageRank and betweenness. Verified a 1000x-tailed input normalizes evenly and ties share a rank.

## Notes
