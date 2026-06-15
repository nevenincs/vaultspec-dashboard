---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
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

