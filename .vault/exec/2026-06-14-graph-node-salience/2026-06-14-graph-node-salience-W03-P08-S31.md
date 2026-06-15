---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S31'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Make MAX_GRAPH_NODES truncation select the top-DOI nodes for the active lens and focus, keeping the subgraph self-consistent and the truncated block honest

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description


## Outcome

Made MAX_GRAPH_NODES truncation lens-and-focus dependent: document nodes are ordered by descending DOI (order_by_salience) before bound_slice truncates, so the top-DOI nodes for the active lens survive. bound_slice keeps the subgraph self-consistent and reports honest truncated metadata. Unit-proven (doi_ordered_truncation_keeps_the_top_salience_nodes).

## Notes

