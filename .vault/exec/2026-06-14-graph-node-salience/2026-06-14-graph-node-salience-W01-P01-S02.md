---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:fc6e0acb784103d61f7589b1e51e70f207484b8f68b59e074c2fedb3251c9e7f'
step_id: 'S02'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Define the tier-weight vector (declared >= structural >> temporal >= semantic) and build the weighted backbone adjacency over the bounded subgraph from the LinkageGraph

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Defined the tier-weight vector (declared 1.0 >= structural 0.9 >> temporal 0.3 >= semantic 0.15) and Backbone::build, which folds the bounded member subgraph into an undirected tier-weighted adjacency. Only edges among served members are admitted.

Defined tier_weight (declared 1.0 >= structural 0.9 >> temporal 0.3 >= semantic 0.15) and Backbone::build, which folds the bounded member subgraph into an undirected tier-weighted adjacency. Membership-bounded: only edges among served members are admitted.

## Notes
