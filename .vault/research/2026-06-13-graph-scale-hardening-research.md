---
tags:
  - '#research'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---

# `graph-scale-hardening` research: `graph API scale + UI backend performance`

The graph API is the spine of the dashboard: every surface reads from it. The
goal is a graph API that stays robust and responsive under adversarial,
concurrent load at corpus sizes approaching millions of nodes. This research
grounds that goal in measurement — a scale + concurrency benchmark over the real
query-serve path (committed as the engine `scale_bench` target) — and
root-causes the failures it surfaces, across the whole UI data plane (ingest,
query core, HTTP routes, and the frontend transport).

The headline correction up front: scaling this is an **LOD + payload-bounding +
algorithmic-complexity** problem, not a GPU problem. GPU acceleration already
lives where it belongs and is correct there; the engine's graph compute is
CPU-bound by nature and the wins are algorithmic. That boundary is finding F5.

## Findings

### F1 — Cold index is super-linear (~O(N²)), the hardest scale blocker

Measured: 500 docs index in 10.4s; 4000 docs index in **601s** — 8× the docs,
~58× the time (≈ O(N^1.95)). At a million docs this is days, so the engine
**cannot currently ingest a large vault at all**.

Root cause (confirmed by reading `ingest-struct` `resolve.rs` and `engine-graph`
`index.rs`): the worktree resolver `resolve(root, mentions)` is invoked **once
per document** inside the index loop, and each invocation:

- calls `walk(root)`, a **full filesystem walk of the entire worktree**, every
  document → O(N) per doc, O(N²) total;
- in `resolve_symbol`, **reads the full text of every code file** in the
  inventory looking for a substring match per symbol mention, behind a `read`
  cache that is **re-created per `resolve` call** (per document) — so each
  document's code reference re-reads the whole codebase;
- in `resolve_step_id`, re-reads every plan file per step mention.

The fix is behavior-preserving and unambiguous: build the inventory **once per
index pass** and pass it in, plus an **inverted index** (basename → path,
symbol/qualified-name → file, step-id → plan) computed once, turning each mention
from an O(N) scan+read into an O(1)/O(log N) lookup. Resolution results are
identical; only the cost changes. The existing resolver test
(`all_three_states_assigned_across_all_four_extractors`) protects correctness.
Target: cold index ~O(N) (linear in corpus bytes).

### F2 — Document-granularity full-slice serialization is linear but unbounded

Measured (document granularity, full slice): 500 nodes → query 15ms, **serialize
50ms, 1.1 MB**; 4000 nodes → query 141ms, **serialize 420ms, 9 MB**. Clean
linear scaling → **~105s serialize and a ~2.25 GB response body at 1M nodes**.
The main `/graph/query` route returns this slice **unpaginated**, and the
serialization (`serde_json::to_vec` over a `Vec<Value>` of enriched node views)
dominates.

The fix is to never put the full document graph on the wire: make the bounded
constellation LOD the default unbounded view (F3 already proves it is cheap),
finish the half-wired cursor pagination so document-granularity is always
bounded, and add a viewport/region filter so descent only materializes the
region in view. This is a **contract change** to the query semantics (bounded
defaults, a viewport parameter), so it belongs in the ADR + a contract-reference
amendment, not a silent refactor.

### F3 — The constellation LOD is the scaling lever, and it already works

Measured (feature granularity): the same 500 nodes / 2000 edges collapse to **10
feature nodes + 10 meta-edges = 5 KB** (~200× smaller); 4000 nodes → 80 feature
nodes / 42 KB. The constellation payload tracks **feature count, not document
count** — for a vault with a bounded set of features it is effectively constant
regardless of corpus size. This is exactly the server-side LOD aggregation the
contract mandates (the GUI never flattens document edges), and it is the right
**default** at scale.

Caveat: the feature projection's *compute* is still O(N) per query (it iterates
all matched member nodes to aggregate `degree_by_tier` and meta-edges), and
`meta_edges(graph)` is recomputed per request. The payload is bounded; the
compute should be memoized (F4).

### F4 — Per-request clone + sort + serialize churn; nothing memoized

`graph_query` clones every matching node and edge (`.cloned().collect()`), sorts
both vectors, and re-derives `node_view`/`degree_by_tier` and `meta_edges` on
**every request**, against a graph that is immutable between commits. Concurrent
reads do scale — the shared `Arc<LinkageGraph>` has no lock and 128 concurrent
document queries completed in ~1s (500 nodes) / ~7.6s (4000 nodes) — but with
~1.7–2× overhead from allocation pressure, and the 9 MB-per-serialization
multiplies under concurrency into real memory pressure.

The graph is good structurally: an adjacency index (`adjacency: HashMap<NodeId,
Vec<EdgeId>>`) makes `degree_by_tier` O(degree) and the document query O(N+E)
linear, **not** quadratic. The fix is to **memoize the derived projections and
the serialized slices on the immutable graph generation** (compute once per
commit, serve borrowed/cached bytes), killing the per-request churn.

### F5 — The GPU boundary, and why it must be codified

GPU acceleration is already correctly placed and must stay there:

- **Rendering** is fully GPU — PixiJS v8 with semantic-zoom LOD, label culling,
  sprite instancing, and GPU glyph-texture generation in the scene field layer.
- **Search** is GPU — vaultspec-rag (CUDA dense/sparse embeddings + Qdrant),
  reached only over its loopback HTTP service and proxied through `/search`.

The engine's graph compute (construction, diff, projection, query) is branchy,
data-dependent, pointer-chasing work over a per-scope node set; GPU-computing it
would be slower and far more fragile. "Millions of nodes" is won by F1–F4 (linear
ingest, bounded payloads, LOD default, memoized projections) plus the existing
GPU render path — not by moving the engine onto a GPU. This should be codified so
no future agent spends effort GPU-ifying the CPU engine.

### F6 — The frontend transport compounds F2 by defaulting to document granularity

The frontend graph query (`frontend/src/stores/server/queries.ts`) defaults to
`granularity: "document"` with no graph pagination, viewport, or infinite-query
wired — so the GUI *requests* the unbounded full slice by default, the exact
payload F2 describes. `queryClient` is otherwise sane (5s stale time,
transient-only single retry). The fix pairs with F2: default the frontend to the
constellation LOD and descend to bounded document/viewport slices on zoom-in.

## Scope and ownership

The findings span four of the five UI layers, all on the data plane:

- ingest (`ingest-struct`, `engine-graph` index) — F1;
- query core (`engine-query`) — F2, F3, F4;
- HTTP routes (`vaultspec-api`) — F2 (bounded query contract);
- frontend transport (`frontend/src/stores`) — F6.

F2/F6 change the query contract and require a contract-reference amendment and an
ADR; F1/F4 are behavior-preserving performance work protected by existing tests
and a re-run of the `scale_bench` evidence. F5 is a codification candidate.

## Next

An ADR deciding the scaling architecture: linear-ingest resolution (shared
inventory + inverted index), the bounded-query contract (LOD default, cursor
pagination, viewport parameter), projection/serialization memoization on the
graph generation, the frontend LOD default, and the codified GPU boundary. Each
decision carries a `scale_bench` before/after as its acceptance evidence.
