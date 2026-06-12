---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S21'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement facet reconciliation across corpus views covering presence, document set, lifecycle state and content hashes, surfacing divergence

## Scope

- `engine/crates/engine-graph/src/facets.rs`

## Description

- Implement facet reconciliation as divergence surfacing: pairwise comparison across a node's corpus views over presence, content (existing views only), and lifecycle.
- Extend the model `Facet` with the ADR-named lifecycle dimension (state plus done/total progress) and `Node` with contract-required `feature_tags`.

## Outcome

Divergence is surfaced as typed signal (presence/content/lifecycle with both scopes named), never auto-merged - 'this feature is ahead on its branch' is the product insight (D4.2). Prerequisite W01P04-101 (one blob-hash namespace) was closed before this step, so content divergence compares truthfully.

## Notes

Model extensions are additive and contract-backed (contract section 4 node fields); no existing serialization broke.
