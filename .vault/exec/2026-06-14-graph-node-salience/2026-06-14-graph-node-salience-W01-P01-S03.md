---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:c33c979e6dec08813f9620fb9d5782e1fe12acbe6e9431a9efd825e1d94c210a'
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
