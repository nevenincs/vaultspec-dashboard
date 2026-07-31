---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
body_hash: 'sha256:2b640b09883ca93021c4754e8df12f2c865f4965e72fd79d46143dcb625808e6'
step_id: 'S19'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the in-memory adjacency graph storing nodes by stable key with per-corpus-view facets

## Scope

- `engine/crates/engine-graph/src/graph.rs`

## Description

- Implement the in-memory adjacency graph: nodes by stable id, edges by stable id, adjacency index over both directions.
- Implement key-plus-facet upsert: a node arriving again merges facets replace-by-scope and unions feature tags - one node per key across every corpus view (ADR D4.2).

## Outcome

Identity lives in the key; branch variance lives in facets; proven by the two-scopes-one-node and facet-replacement tests.

## Notes

None.
