---
name: derived-projections-memoize-on-the-graph-generation
---

# Derived graph projections memoize on the graph generation

## Rule

Every per-request derived projection over the engine's `LinkageGraph` — the
enriched document node/edge views, the constellation `meta_edges`, the salience
lens basis, and any future projection — must be memoized keyed on the immutable
graph `generation` counter and invalidated when the graph is committed, never
recomputed from scratch per request. A new projection that derives expensive
state per request without a generation-keyed cache is a defect.

## Why

The graph is immutable between commits, so a projection computed once per
generation is correct to serve for every read until the next commit; recomputing
it per request is pure waste that compounds under concurrency. The
`performance-sweep` research measured the cost: 128 concurrent document queries
took ~4.5s at 2000 nodes because `graph_query` re-derived `node_view`,
`degree_by_tier`, ontology projections, and sorted/serialized the slice on every
call. The A1 fix memoized the enriched views per `generation` (commit
`3f21826`), mirroring the `meta_edges`/`salience_basis` caches that already
existed — making repeat and concurrent reads ~free. The load-bearing invariant
the review verified: the graph swap must happen-before the generation bump (both
`SeqCst`) so a reader observing generation `G+1` necessarily observes the new
graph; a stale projection served across a commit would be a correctness bug, not
just a perf miss.

## How

- **Good:** a new projection caches `Some((generation, Arc<T>))` behind a
  poison-recovering `Mutex` on the cell, returns the cached value when
  `cached_generation == self.generation.load(SeqCst)`, and recomputes-and-stores
  on a miss; `commit_graph` swaps the graph then `fetch_add`s the generation so
  the cache invalidates atomically.
- **Bad:** a route handler that calls `serde_json::to_value(node)` +
  `degree_by_tier` + sort + serialize for the whole slice on every request with
  no generation key — it recomputes immutable-between-commits state per call and
  melts under concurrent load.

## Status

Active. Promoted from the `performance-sweep` campaign (A1) after the
memoize-on-generation discipline held across the `meta_edges`, `salience_basis`,
and document-view projections. Complements the GPU-boundary and bounded-query
rules from the graph-scale cycle.

## Source

ADR `2026-06-16-performance-sweep-adr` and research
`2026-06-15-performance-sweep-research` (avenue A1, measured baselines). Sibling
rules `graph-queries-are-bounded-by-default`,
`graph-compute-is-cpu-gpu-is-render-and-search`,
`bounded-by-default-for-every-accumulator`.
