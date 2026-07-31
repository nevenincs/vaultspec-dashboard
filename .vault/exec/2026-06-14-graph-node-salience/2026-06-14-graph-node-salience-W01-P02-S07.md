---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:912ff60a127c54648aca7e5f77d0b4c50162901d17131fcaa5f22c2ee5ecb201'
step_id: 'S07'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Implement one Brandes betweenness pass over the backbone, returning per-node betweenness under the node ceiling

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Implemented one Brandes betweenness pass over the backbone (BFS shortest-path counting plus dependency back-propagation, undirected double-count halved). O(n*m), affordable only under the node ceiling. Verified against a hand-computed bridge.

Implemented one Brandes betweenness pass over the backbone (BFS shortest-path counting + dependency back-propagation, undirected double-count halved). O(n*m), affordable only under the node ceiling. Verified against a hand-computed bridge (middle of a 3-path carries all betweenness).

## Notes
