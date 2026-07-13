---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Add production graph query timing fixtures

## Scope

- `engine/crates/engine-query/tests/query_hotpaths.rs`

## Description

- Add a real `LinkageGraph` hotpath fixture with 640 document nodes and scoped edges.
- Build production document projection views and run both uncached and cached document
  queries.
- Log projection, uncached query, and cached query timings under `--nocapture`.
- Assert real output invariants: expected filtered node count, feature-tag membership,
  self-consistent returned edges, and cached/uncached wire equality.

## Outcome

The query hotpath now has a production-code timing fixture. It does not use a fake
engine, copied business logic, or a tautological mock response; it builds the graph
through `engine_graph::ingest` and exercises the same `engine-query` functions as the
serve route.

## Notes

Verification:

- `cargo test -p engine-query --test query_hotpaths -- --nocapture`
