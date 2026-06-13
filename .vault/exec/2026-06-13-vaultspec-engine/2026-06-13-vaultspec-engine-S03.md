---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-12'
step_id: 'S03'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---




# Carry the contract section 4 node fields (title, dates, lifecycle, degree-by-tier) on list-shape graph nodes, not only the detail bundle

## Scope

- `engine/crates/engine-query/src/graph.rs`
- `engine/crates/engine-model/src/lib.rs`

## Description

- Add `dates` and `doc_type` to `engine_model::Node` (contract section 4),
  populated by the indexer.
- Add `node_view`: serialize the stored node and hoist the query-time
  projections - `degree_by_tier` and the scope facet's `lifecycle` - to the top
  level.
- Change `GraphSlice.nodes` to a value list and route document-granularity nodes
  through `node_view`.

## Outcome

List-shape document nodes now carry title, dates, doc_type, lifecycle, and
degree_by_tier - not only the detail bundle. Conformance divergence 3 is green.

## Notes

`GraphSlice.nodes` moved from the stored `Node` type to a serialized value list
so it can carry the query-time projections; the model `Node` stays the storage
shape. This is the field addition that the seven test-fixture initializers had
to learn - the build-unblock fix that preceded this addendum's forward work.

