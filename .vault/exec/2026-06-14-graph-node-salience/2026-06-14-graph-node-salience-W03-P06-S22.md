---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Define the Lens enum and per-lens parameter rows (teleport bias, dominant centrality, type-prior weights, recency emphasis, lifecycle modulation) with status as the default

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Defined the Lens enum (Design, Status with Status the #[default]) and the per-lens parameter rows: teleport_bias (per authority class), type_prior (per authority class), and weights() (the WeightRow: type-prior/centrality/recency/role/burst/focus-gamma/betweenness-blend/half-life). Lens::parse defaults to status.

## Notes

