---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Unit-test the basis: PageRank convergence on a known graph, partial-vector linearity, Brandes betweenness against a hand-computed bridge, coreness peeling of pendant exec leaves

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Basis unit tests: PageRank convergence on a known graph, partial-vector linearity (combine equals the PPR of the blended teleport), Brandes against a hand-computed bridge, coreness peeling of pendant exec leaves, and one-sweep basis assembly. All 11 salience tests green.

Basis unit tests: PageRank convergence on a known graph, partial-vector linearity (combine == PPR of the blended teleport), Brandes against a hand-computed bridge, coreness peeling of pendant exec leaves, and the one-sweep basis assembly. All green (11 salience tests pass).

## Notes
