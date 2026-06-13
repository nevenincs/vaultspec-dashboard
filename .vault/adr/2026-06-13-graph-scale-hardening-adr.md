---
tags:
  - '#adr'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-graph-scale-hardening-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
---

# `graph-scale-hardening` adr: `graph API scale + UI backend performance architecture` | (**status:** `accepted`)

## Problem Statement

The graph API is the spine of the dashboard — every surface reads from it — and
it must stay robust and responsive under adversarial, concurrent load at corpus
sizes approaching millions of nodes. The companion research measured the real
query-serve path and found three failures that make that goal currently
unreachable, plus the strengths to build on. This ADR decides the architecture
that turns "millions of nodes" from aspiration into a measured property. It is
prompted by the scale benchmark evidence, not a feature request, and its scope
is the whole UI data plane: ingest, query core, HTTP routes, and the frontend
transport.

## Considerations

The research findings (F1–F6) are the inputs. The decisive ones: cold index is
super-linear (~O(N²)) and so cannot ingest a large vault (F1); the
document-granularity full slice is serialized whole and returned unpaginated,
linear but unbounded toward a multi-gigabyte body (F2); the constellation LOD
already collapses the corpus to a feature-count-bounded payload and is the
correct default at scale (F3); per-request clone/sort/serialize churn is
unmemoized against an immutable-between-commits graph (F4); GPU acceleration is
already correctly placed at rendering and RAG search, and the engine's graph
compute is correctly CPU-bound (F5); and the frontend compounds F2 by defaulting
to document granularity (F6).

The overriding consideration is that this is an **LOD + payload-bounding +
algorithmic-complexity** problem. The temptation to "make the graph API
GPU-backed" is a category error: the engine's graph work is branchy,
pointer-chasing, data-dependent computation over a per-scope node set, which a
GPU serves poorly. The honest path to scale is linear ingest, bounded payloads,
LOD-by-default, and memoized projections — on the CPU — feeding the
already-GPU render path.

## Constraints

- The wire contract (foundation reference §2/§4) guarantees the `{data, tiers}`
  envelope, stable ids, and that the GUI never flattens document edges
  client-side. The bounded-query decision (D2) changes query *semantics* (a new
  viewport parameter, a bounded default), which is a contract event: it requires
  a contract-reference amendment reviewed by both engine and GUI owners, and
  must preserve the envelope and id guarantees.
- The engine is read-and-infer; none of these changes may introduce vault
  writes, ref mutation, or sibling semantics. Resolution stays a pure function
  of the worktree; only its cost changes.
- D1 (linear ingest) and D3 (memoization) must be **behavior-preserving**:
  identical resolution states and identical query results, proven by the
  existing resolver/query tests staying green and a `scale_bench` before/after.
- Memoization (D3) must respect the single-writer commit model: caches are keyed
  to the immutable graph generation and invalidated atomically on commit, never
  serving a stale projection across a rebuild.

## Implementation

A high-level shape, decision by decision; the plan sequences and the reference
captures concrete signatures.

- **D1 — Linear-ingest resolution.** Compute the worktree inventory **once per
  index pass** and thread it into resolution, and build an **inverted index**
  over it a single time: basename → path, qualified-symbol → file(s), step-id →
  plan. Each mention resolves by lookup rather than by walking the tree and
  re-reading every code/plan file. Resolution states (resolved/stale/broken) are
  unchanged; the per-document full-tree walk and per-document codebase re-reads
  disappear. Target: cold index ~O(N) in corpus bytes.

- **D2 — Bounded-query contract.** The constellation (feature) LOD becomes the
  default unbounded view (it is feature-count-bounded and already cheap).
  Document granularity is always bounded: finish the cursor pagination so a
  document query returns a capped page with `next_cursor`, and add a
  viewport/region filter so descent materializes only the in-view slice. A hard
  per-response node ceiling guards against an unbounded body regardless of
  parameters. This is the contract amendment.

- **D3 — Memoized projections on the graph generation.** Derive the expensive
  projections — `degree_by_tier`/`node_view` enrichment, the feature-node
  aggregation, and `meta_edges` — and the serialized slice bytes **once per
  commit**, cached on the immutable graph generation and served borrowed, so
  concurrent reads reuse one computation instead of each cloning, sorting,
  re-deriving, and re-serializing.

- **D4 — Frontend LOD default + viewport descent.** The frontend graph query
  defaults to the constellation LOD and descends to bounded document/viewport
  slices on zoom-in, consuming D2's pagination and viewport parameters.

- **D5 — Codified GPU boundary.** Rendering (PixiJS) and search (RAG) are the
  GPU workloads; the engine graph compute stays CPU. Codify this so the boundary
  is not re-litigated.

## Rationale

Every decision is anchored to a measured finding (research F1–F6) with a
`scale_bench` number behind it, and each carries a before/after as its
acceptance evidence — the same evidence-first discipline the benchmark
established. D1 attacks the largest blocker (a quadratic ingest that no payload
trick can rescue) with a behavior-preserving change protected by existing tests.
D2/D3 follow the contract's own LOD philosophy (the engine aggregates; the GUI
never flattens) to its conclusion: the bounded constellation is not just a view,
it is the *default* at scale, and the document graph is something you page and
viewport into, never something you ship whole. D5 records the boundary the
research had to correct, so the effort stays aimed at the levers that actually
move scale.

## Consequences

Gains: cold index becomes feasible at large corpus sizes (linear); the wire
never carries a multi-gigabyte body; concurrent reads stop re-deriving and
re-serializing the same projections, cutting allocation pressure; and the GUI
stays responsive by rendering a bounded LOD and descending on demand.

Costs and pitfalls: D2 is a contract change with a migration note for clients
(the default granularity shifts, a viewport parameter appears) and must be
reviewed by both engine and GUI owners. D3's memoization adds cache-invalidation
surface that must be bound exactly to the commit boundary — a stale projection
served across a rebuild would be a correctness bug, so the cache lifecycle is
the riskiest part and needs its own tests. D1 changes the internal resolution
data flow; the resolver tests must stay green to prove states are unchanged. The
viewport/region query (D2) opens a pathway to spatial indexing later if descent
itself becomes hot, but v1 keeps it to a bounded linear filter.

## Codification candidates

- **Rule slug:** `graph-compute-is-cpu-gpu-is-render-and-search`.
  **Rule:** The engine's graph compute (construction, diff, projection, query)
  stays CPU-bound; GPU acceleration belongs only to rendering (PixiJS) and
  semantic search (RAG), and scale is won by linear ingest, bounded payloads, and
  LOD-by-default — never by moving the graph engine onto a GPU.

- **Rule slug:** `graph-queries-are-bounded-by-default`.
  **Rule:** Every graph read is bounded — the constellation LOD is the default
  unbounded view, and document granularity is always paginated and/or
  viewport-scoped under a hard node ceiling; no endpoint may serialize an
  unbounded full-document slice onto the wire.
