---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S23'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Parameterize the design lens: teleport biased to ADR and research authority, PageRank-led with high coreness and low recency weight

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Parameterized the design lens: teleport biased to ADR (design authority) + research/reference (substrate), PageRank-led (low betweenness-blend 0.2), high coreness weight, low recency (0.05, 365d half-life). Decisions are durable.

## Notes

