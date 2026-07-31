---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:ffda4a23c36ee7e488e48fd1dcf7dbd594c371d4d982c61adf5b8c3052b88ef7'
step_id: 'S17'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement the weighted-linear a-priori composition (type-prior, personalized centrality, recency, lifecycle, structural role) parameterized by a per-lens weight row

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented the weighted-linear a-priori composition (type-prior, PPR+betweenness-blended centrality, recency, structural-role, burst) parameterized by the per-lens WeightRow, scaled by the discrete lifecycle multiplier. Verified against a hand-computed blend.

## Notes
