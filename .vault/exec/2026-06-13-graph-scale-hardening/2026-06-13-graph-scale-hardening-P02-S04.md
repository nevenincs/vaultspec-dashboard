---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S04'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Memoize the derived projections and serialized slice on the graph generation, invalidated at commit

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Added a `OnceLock<Vec<MetaEdge>>` cache to `LinkageGraph` (in `engine-graph`):
  the O(E · feature_tags²) cross-feature meta-edge aggregation computes once per
  graph instance via `meta_edges_cached()` and is shared by every reader,
  including concurrent `Arc` readers.
- Split the public `meta_edges()` free function into a thin cached entry point
  plus `compute_meta_edges()` (the work), so all existing callers (the feature
  query, the route, the bench) get the cache transparently.
- Invalidate the cache on any structural mutation (`upsert_node`,
  `insert_validated_edge`); a fresh graph (each commit rebuilds one) starts with
  an empty cache, satisfying the ADR's commit-boundary invalidation.

## Outcome

The redundant per-request `meta_edges` recompute in the library query path (the
route already discarded it in favor of its own `state.meta_edges()` cache) is
gone, and the projection is now computed once per generation. Behavior-preserving:
the `meta_edges_aggregate_*` and `feature_granularity_*` tests stay green;
`engine-graph`/`engine-query` clippy and tests are green.

## Notes

DEVIATION/scoping honesty: the step title also names the *serialized slice*. In
the single-feature-tag synthetic bench corpus, `meta_edges` is already cheap (no
tag² blow-up), so the cache's measured win here is modest — its real value is on
multi-tag vaults and in removing the duplicated route recompute. The dominant
costs the bench exposes are `feature_nodes` (O(N) member aggregation, feature
path) and full-slice JSON serialization (document path). Rather than build a
scope/filter/granularity-keyed response cache (high cache-invalidation risk, and
the route layer already caches `meta_edges`), those are addressed structurally by
P03: bound the payload (LOD default + pagination + viewport + node ceiling) so
the engine never aggregates or serializes the full set. Bound-don't-cache is the
deliberate choice for the document path.

This step's uncommitted edits were reverted once by a concurrent agent/linter on
the shared `engine-graph` files; re-applied and committed immediately by pathspec
to lock them in.
