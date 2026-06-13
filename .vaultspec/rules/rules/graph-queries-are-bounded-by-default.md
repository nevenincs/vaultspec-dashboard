---
name: graph-queries-are-bounded-by-default
---

# Graph queries are bounded by default

## Rule

Every graph read is bounded: the constellation (feature) LOD is the
unbounded-safe default view, and document granularity is always served under a
hard node ceiling (`MAX_DOCUMENT_NODES`) with the returned subgraph kept
self-consistent (only edges among kept nodes) and any truncation stated honestly
in a `truncated` block. No engine endpoint may serialize an unbounded
full-document slice onto the wire; descent into detail is scoped (by feature
filter or ego/neighbor query), never "return everything".

## Why

The wire response is the scale cliff: the `2026-06-13-graph-scale-hardening`
research measured the document-granularity slice as linear-but-unbounded —
1.1 MB at 500 nodes, 9 MB at 4000, extrapolating to ~2.25 GB and ~100s of
serialization at a million nodes (finding F2). The constellation LOD collapses
the same corpus to a feature-count-bounded payload (5 KB / 42 KB) and is ~15×
cheaper under concurrent load. A single unbounded query is therefore a
denial-of-service on the whole dashboard, and the GUI must never request — nor
the engine ever serve — the raw million-node graph.

## How

- **Good:** a new graph surface needs data → it reads the constellation LOD, then
  descends with `granularity=document` + `filter.feature_tags=[<tag>]` (bounded
  by that feature's members) or `/nodes/{id}/neighbors` (bounded ego network).
- **Good:** a document query that could exceed the ceiling returns the capped
  subgraph plus `truncated: {total_nodes, returned_nodes, reason}`, and the
  client narrows rather than receiving a partial-but-silent result.
- **Bad:** a route or hook that requests document granularity for a whole scope
  with no filter and no ceiling, expecting "all the nodes" — that is the
  multi-gigabyte body the ceiling exists to prevent.

## Status

Active. Landed in the `2026-06-13-graph-scale-hardening` cycle (ADR decision D2):
the document node ceiling ships in the `/graph/query` route, the LOD default is
the GUI's `Stage` consumption, and the bounded-query semantics are amended into
the contract reference §4. Spatial viewport bounding is client-side (the engine
holds no layout coordinates — see `graph-compute-is-cpu-gpu-is-render-and-search`).

## Source

ADR `2026-06-13-graph-scale-hardening-adr` (D2) and research
`2026-06-13-graph-scale-hardening-research` (findings F2, F3, F6). Contract
reference `2026-06-12-dashboard-foundation-reference` §4. Sibling rules
`graph-compute-is-cpu-gpu-is-render-and-search`,
`every-wire-response-carries-the-tiers-block`, `dashboard-layer-ownership`.
