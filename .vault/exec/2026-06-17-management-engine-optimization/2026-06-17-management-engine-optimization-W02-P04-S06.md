---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S06'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---




# Wire cached query indexes through scope state

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Store `engine_query::graph::DocumentViews` directly in `ScopeCell`.
- Update present document query and graph embedding routes to pass the indexed view
  object into `graph_query_cached`.
- Preserve adaptive warming and generation invalidation behavior.

## Outcome

The serve scope state now carries generation-keyed document query indexes alongside the
existing projection cache. Present document queries and embedding node-set selection use
the same indexed cache object.

## Notes

Verification:

- `cargo test -p vaultspec-api`
- Live frontend backend suite: 8 files, 80 tests
