---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement query-time projections for per-tier degree counts and lifecycle progress summaries

## Scope

- `engine/crates/engine-graph/src/project.rs`

## Description

- Implement query-time projections: per-tier degree counts (zero-filled across all four tiers) and lifecycle-in-scope summaries read straight from facets.

## Outcome

Projections are derived at query time from the in-memory graph, never stored on nodes (engine-spec section 4.3); contract section 4 `degree_by_tier` shape served.

## Notes

None.
