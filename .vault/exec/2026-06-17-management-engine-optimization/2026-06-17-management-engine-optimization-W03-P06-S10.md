---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S10'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---




# Reuse bounded as-of projection views

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Wrap cached historical graphs in `CachedAsofGraph`.
- Add a lazy per-commit document projection/index cache inside the cached as-of entry.
- Route `/graph/query` as-of document queries through `graph_query_cached` using those
  historical views.
- Update temporal routes to read the historical graph through the cached wrapper.

## Outcome

Repeat document-granularity time-travel queries for a cached commit now reuse the
historical document projection/index instead of rebuilding views on every revisit.
Feature and lineage projections keep their existing paths.

## Notes

Verification:

- `cargo test -p vaultspec-api asof --lib`
- `cargo test -p vaultspec-api`
