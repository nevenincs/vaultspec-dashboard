---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S35'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the scoped graph query over scope, filter and as-of against the in-memory graph

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Implement the scoped graph query: stateless per-request scope narrows facets and edges to one corpus view (contract section 3), the validated filter applies to nodes and edges, and the normalized filter echoes back on the slice.
- Implement granularity: document level returns doc edges; feature level returns engine-aggregated meta-edges only (the GUI never flattens doc-level edges client-side, contract section 4).

## Outcome

The single query implementation both front doors will shell over (D6.1); deterministic id-sorted output.

## Notes

As-of composition: callers reconstruct a historical graph via the P07 asof path and run this same query over it - one query core, two graph sources.
