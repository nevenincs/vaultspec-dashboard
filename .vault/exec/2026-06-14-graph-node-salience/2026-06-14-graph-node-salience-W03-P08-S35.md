---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S35'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add route-level tests asserting lens default, salience presence on nodes, lens-dependent truncation, and the tiers block on success and error envelopes

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

## Outcome

Added route-level integration tests (salience_routes.rs): lens default to status, salience presence + [0,1] range on every document node, the two lenses serving the same node set in two orderings, the unknown-lens tiered 400, neighbors carrying salience + lens echo, and (S46) the degraded-tier partial flag end to end. All 5 green.

## Notes
