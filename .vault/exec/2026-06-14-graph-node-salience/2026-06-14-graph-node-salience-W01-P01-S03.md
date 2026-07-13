---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Restrict the headline-centrality backbone to the high-precision declared and structural tiers, admitting temporal and semantic only as damped enrichment

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

backbone_weight restricts the headline-centrality topology to declared and structural tiers only (None for temporal and semantic), so the dense low-precision tiers cannot hijack centrality; they enter later stages only as damped enrichment. Proven by the off-backbone-edge-excluded test.

## Notes
