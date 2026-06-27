---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S45'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add an integration test asserting basis memoization survives a no-op query and recomputes on graph generation change

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Added the basis-memoization integration test (app.rs salience_basis_is_memoized_per_generation): a no-op query is a warm-cache hit (same Arc), and a generation bump (rebuild) recomputes over the same bounded node set. The expensive PPR/Brandes/k-core sweep runs at most once per graph generation, shared by all lenses. Green.

## Notes
