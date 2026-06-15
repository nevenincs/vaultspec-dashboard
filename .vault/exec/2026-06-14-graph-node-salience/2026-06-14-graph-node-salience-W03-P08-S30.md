---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S30'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Thread lens through graph_query and attach the single active-lens salience float to each served document node view

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description


## Outcome

Threaded the lens through graph_query_route: the route computes the per-generation basis (ScopeCell::salience_basis), runs compute_salience for the active lens+focus, and attaches the single active-lens salience float to each served document node view via annotate_nodes. The active lens is echoed in the response.

## Notes

