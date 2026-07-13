---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Assemble the lens-basis struct memoized per graph generation, computing PPR hubs, betweenness, coreness, and role features in one sweep keyed to the immutable graph generation

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Assembled LensBasis::compute: builds the backbone, reads per-node ontology (authority, lifecycle, modified), builds the shared partial-vector hub basis over the five authority-class hubs, and runs Brandes, coreness, roles, and aggregated-exec in one sweep keyed to the immutable graph generation.

## Notes
