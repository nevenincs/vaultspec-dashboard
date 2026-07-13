---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Unit-test the backbone builder: tier weighting applied, semantic-tier edges damped, bounded-subgraph membership preserved

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Unit tests: tier weighting applied (declared edge weights above structural), off-backbone edges damped out of the topology, and bounded-subgraph membership preserved (edges to dropped nodes do not appear). Green.

## Notes
