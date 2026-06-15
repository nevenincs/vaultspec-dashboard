---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Compute the structural-role feature (hub/authority/bridge/leaf) and the aggregated-exec feature (children rolled into the parent plan) reading the semantics aggregate hint, authority_class, and lifecycle fields

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Computed the structural-role feature (authority, hub, bridge, leaf from degree and betweenness shares) and the aggregated-exec feature (exec children rolled into the parent, reading the ontology aggregate hint). Reads authority_class, lifecycle, and aggregate via the graph-node-semantics integration seam.

## Notes

