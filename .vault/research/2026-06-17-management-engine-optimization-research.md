---
tags:
  - '#research'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
related: []
---

# `management-engine-optimization` research: `Becca/Rust management-engine optimization discovery`

This is the opening discovery pass for the Becca/Rust optimization campaign over the
management engine and data-provider surfaces. The goal was to map the current
architecture, separate already-closed resource-exhaustion fixes from still-current
hotspots, and identify tests or signal paths that can create false confidence.

Method: read the in-flight vault status, searched prior vault records with
`vaultspec-rag`, ran semantic code searches over the engine and stores, and verified
the findings by reading the current Rust and TypeScript source. The worktree was
already dirty with active engine and vault changes, so this pass made no source edits.

## Findings

### F1. Current architecture is bounded at the crash boundaries

The prior resource-hardening and backend-hotpath waves are materially present in the
current code. The serve state is split into per-scope `ScopeCell` instances with a
bounded graph delta ring, generation-keyed projection caches, bounded as-of cache,
bounded semantic-vector cache, and a bounded dashboard-state slot. Watcher rebuild
events use a capacity-one coalescing channel, and declared-tier folding is guarded by a
single active fold plus a trailing-edge flag. Sibling subprocesses in the ops route and
the core runner carry both stdout caps and wall-clock timeouts with kill-on-bound.
RAG/Qdrant reads have per-page byte caps, per-page socket timeouts, page-count caps, and
an overall embedding-scroll budget.

Interpretation: the historic OOM/hang class is mostly closed. The next performance
campaign should focus less on "add bounds everywhere" and more on CPU work that still
happens before a bounded response is serialized.

### F2. Document graph queries still scan the full node and edge sets per request

`graph_query_cached` reuses per-generation node and edge view maps, but
`graph_query_inner` still builds `matched` by scanning every node in scope and then
scans every edge in scope on each document query. The serialization cap prevents
multi-gigabyte responses, but the route still pays O(V + E) filtering and sorting
before the cap. This is visible in `engine-query` where the document arm builds the
kept set, scope-node set, filtered edge list, sorted edge list, and cloned cached view
values per request.

Optimization direction: add a per-generation query index alongside `DocViews`: in-scope
node ids, node ids by feature tag/doc type/status/tier/kind/date bucket, edge ids by
tier/relation/state, and pre-sorted id order. Then compile filters into intersections
over id sets and materialize only the returned ids. This should be the main backend
throughput step because it attacks repeated O(V + E) request work without changing the
wire contract.

### F3. Filter matching still does repeated linear membership and string allocation

`Filter::validated` sorts and dedups several vectors, but `matches_node` and
`matches_edge` still use repeated `.iter().any()` / `.contains()` over those vectors.
The text facet lowercases the needle and each candidate node key/title inside
`matches_node`, which makes a text search allocate per node. Prior research already
deferred part of this as `backend-hotpath-hardening` F5; the code still shows it.

Optimization direction: either use `binary_search` on the sorted vectors or introduce a
compiled filter form with `HashSet`/small-set membership plus pre-lowercased text. For
text search, normalize the needle once and compare against cached lowercase search text
in the per-generation query index.

### F4. Salience basis construction remains a major single-generation CPU cost

The salience basis is correctly memoized per graph generation and warmed off the
request path, but the computation itself is still heavy. `brandes_betweenness` runs a
single-threaded Brandes pass over every backbone source, and `coreness` claims linear
k-core peeling while using a repeated `min_by_key` scan over all unremoved nodes, making
that part O(V^2). Warming moves the stall off a user request, but it still lengthens
rebuild recovery and competes with other agents on the shared machine.

Optimization direction: replace exact Brandes with a bounded approximation for large
graphs, or parallelize source passes and reduce centrality vectors. Replace the k-core
implementation with a bucket-queue Batagelj-Zaversnik form so the code matches the
commented complexity. Gate this with a scale fixture that asserts ranking stability
within tolerance rather than exact equality for approximate centrality.

### F5. Commit-time feature delta projection does graph-scale work under the commit section

`ScopeCell::commit_graph` holds the ring lock while it diffs the old/new document graph,
projects feature deltas, serializes document deltas, appends the ring, broadcasts, swaps
the graph, and bumps generation. The feature delta helper projects old and new graphs
into feature nodes and meta-edges for every commit. For large graphs, doing this inside
the commit section increases contention and delays ring readers/resume handling.

Optimization direction: compute document and feature payload candidates before taking
the ring commit mutex, then use the locked section only to allocate sequence numbers,
append the bounded ring, broadcast, swap, and bump generation. If sequence assignment
must stay contiguous after projection, reserve the sequence range under lock and fill
payloads outside it, then re-enter only to commit.

### F6. Historical/as-of graph queries reuse graph builds but not projection views

The present-view query path uses `cell.document_views()` and `graph_query_cached`.
The `as_of` branch resolves and caches historical graphs by sha, but then calls plain
`graph_query`, so repeat visits to the same historical graph skip re-indexing but still
recompute document node/edge view projections for that historical graph. This matters
for time-travel scrubbing where users revisit a small set of commits repeatedly.

Optimization direction: carry generation-like projection caches inside the bounded
as-of cache entry, or wrap cached `AsofGraph` with document/feature projection caches.
Keep the cap small and sha-keyed to preserve the existing memory bound.

### F7. Semantic embedding reads are bounded but first-use still scrolls all vectors

`/graph/embeddings` computes the served document node set, then reads the full vault
document vector map from Qdrant and intersects it with served ids. The full map is
cached by semantic epoch, so repeat reads are cheap, but the first semantic-mode entry
still scrolls every stored vector. This is bounded by page count and wall-clock budget,
so it degrades safely, but it is still an expensive first-use path.

Optimization direction: prefer a Qdrant filtered/point-id fetch for the served node ids
if rag stores a stable payload or point id that can be queried directly. If that shape is
not available, keep the current full-map cache but report first-scroll timing so the UI
can distinguish "semantic warming" from a frozen graph.

### F8. The active dashboard-state backend work is well-bounded but not yet reflected in plan state

The active `dashboard-state-centralization` plan has W01 open, while the worktree
already contains a backend `state.rs` route, route registration, and tests for read,
patch, validation, selected-id bounds, date-range rejection, and tiers on errors. The
route stores snapshots in a bounded 16-scope LRU, caps selected ids, caps id/tab lengths,
validates node ids against the live graph, and keeps state transient. This is consistent
with the plan, but the plan checkboxes have not been advanced.

Action: before new work stacks on this file, reconcile the active plan against the
current source and run its required Rust route tests. Do not mark steps closed until the
full expected verification for those steps is actually green.

### F9. Test-signal risks are broad and should be separated from production hotpaths

Mechanical scan counts in the current tree: 87 `MockEngine` references, one
`describe.skipIf`, 99 `vi.fn` references, 13 `vi.spyOn` references, one `vi.stubEnv`,
two `mockImplementation` references, and two `const fake` occurrences. Some are
legitimate UI seams or historical mock-mirrors-live-wire-shape work, but they are still
false-positive risk for this campaign. The live engine conformance suite is skipped when
`ENGINE_BASE_URL` is absent; that was intentional historically, but it means a normal
Vitest run can be green without exercising the live management engine.

Action: classify tests in a dedicated audit pass:

- Production-engine gates: no mocks/skips/fakes, real route or live service.
- UI-only interaction tests: event handlers/spies allowed only when no engine behavior is
  being asserted.
- Mock parity tests: allowed only when paired with captured live samples or live route
  conformance.
- Tautology candidates: tests that only assert a fixture equals its own constants or a
  mock's authored behavior should be rewritten or downgraded from confidence signals.

### F10. Recommended campaign plan shape

1. Reconcile the active `dashboard-state-centralization` plan with current backend
   changes and verify W01 before extending the data-provider surface.
2. Add a management-engine optimization ADR that authorizes generation-keyed query
   indexes, salience centrality changes, commit-section shortening, and as-of projection
   caches.
3. Plan the implementation in four waves: measurement harness, query/index hotpaths,
   rebuild/commit hotpaths, and test-signal hardening.
4. Keep all changes path-scoped. The shared worktree is active and already dirty; no
   stash, checkout, reset, or broad staging should be used.
