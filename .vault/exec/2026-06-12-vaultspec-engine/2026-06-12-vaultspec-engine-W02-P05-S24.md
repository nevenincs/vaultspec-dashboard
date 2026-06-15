---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S24'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement context assembly as a pure serializable read returning the tier-labelled bundle for any node

## Scope

- `engine/crates/engine-graph/src/context.rs`

## Description

- Implement `context(node)`: the full tier-labelled bundle - node with facets, edges grouped by tier, distinct neighbors, degree projection - as a pure serializable read.
- Deterministic output ordering (sorted edges and neighbors) so repeated assembly is byte-identical.

## Outcome

The orchestration seam per ADR D4.4: graph in, JSON-clean bundle out; purity, serializability, determinism, and truthful-None-for-unknown all tested.

## Notes

None.
