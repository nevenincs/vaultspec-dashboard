---
tags:
  - '#research'
  - '#graph-semantic-embeddings'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# Semantic embeddings backend research

## Problem & why semantic collapses to a circle (evidence)

The dashboard's `semantic` representation mode is meant to be a "meaning constellation" — nodes projected to 2D by embedding similarity so meaning-clusters separate spatially. In the running app every node instead collapses onto one **stable circle**, and the evidence pins the cause to a single missing wire field, not a projection bug.

The scene projection is correct and ready. `semanticProjection` (`frontend/src/scene/field/semanticLayout.ts:42`) partitions nodes into `embedded` (those with `Array.isArray(n.embedding) && n.embedding.length > 0`, line 45) and `fallback` (those without, line 48). Only `embedded` nodes run through `projectTo2D` (line 56); every `fallback` node is placed on a ring at the fixed `SEMANTIC_FALLBACK_RADIUS = 760` (line 30, placement lines 67-74). The scene node type carries the field — `SceneNodeData.embedding` is mapped from `node.embedding` in `sceneMapping.ts:24` — and the wire type declares it: `EngineNode.embedding?: number[]` (`engine.ts:419`).

The collapse is therefore: **the live engine serves no `embedding` on any node, so every node falls into the `fallback` partition and rings the fallback radius — a circle of embeddingless nodes, never a meaning cloud.** Confirmed in the engine: `node_view` (`engine/crates/engine-query/src/graph.rs:93-122`) enumerates every additive node field it projects (`degree_by_tier`, `lifecycle`, `authority_class`, `aggregate`, `status_value`, `status_class`) and **no `embedding` field is set anywhere**. A whole-engine grep for `embedding` returns only `rag-client/src/lib.rs:8` ("The engine builds no embeddings, ever"). `adaptGraphSlice` passes nodes through via `...rest` (`liveAdapters.ts:144,152`), so it would *carry* an embedding if present, but none is produced.

The mode appears to "work" in tests because of the **mock-vs-live split** the project's own `mock-mirrors-live-wire-shape` rule warns about: the mock corpus seeds synthetic clustered embeddings (`corpus.ts:198` `EMBEDDING_DIM = 8`; `featureEmbedding` attaches an 8-float vector to every doc/rule node, lines 295-297, 377). Consumer tests pass against the mock; the live origin serves nothing.

## Current state: wire, gate, projection, rag client (file:line)

**Wire (typed, unserved).** `EngineNode.embedding?: number[]` exists (`engine.ts:419`) as the §4-amendment integration seam (added at representation build W01.P01.S01) — a type the engine producer was expected to fill but never did. No `embedding` route, parameter, or projection exists anywhere in `engine/`.

**Gate (measured, ships on synthetic data only).** `SEMANTIC_MODE_GATE` (`semanticGate.ts:138`) is computed once at module load by `runSemanticGate()` (111-126), which builds a **synthetic** ceiling-sized labelled slice via `buildGateSlice(1500, 8)` (ceiling at :21, dim 8 at :46), measures projection wall time vs `SEMANTIC_GATE_TIME_BUDGET_MS = 250` (:23) and `clusterSeparation` vs `SEMANTIC_GATE_SEPARATION_MIN = 1.2` (:27). The dispatcher downgrades `semantic`→`connectivity` when `!shipped` (`representationLayout.ts:69-74`). **Critical:** the gate measures projection cost and separation on a clean synthetic fixture, never on real served data — so even if it reports "shipped," the real path produces the fallback ring because served nodes carry no embedding. The gate proves the projection is fast and separates synthetic clusters; it cannot prove the data path delivers real embeddings.

**Projection (deterministic, torch-free, correct).** `projectTo2D` (`semanticLayout.ts:93`) is classical linear DR: mean-center, build the `dim×dim` covariance, extract the top-2 principal axes by 64-iteration power iteration (`powerIteration`, :128) with deflation between PC1/PC2 (`deflate`, :139), deterministically seeded with `sin` — no `Math.random`. Pure PCA-to-2D; the module comment is candid ("'UMAP' names the INTENT… the algorithm is a classical linear DR").

**Rag client (loopback HTTP, search-only, returns no vectors).** `engine/crates/rag-client/` reaches rag strictly over its resident loopback HTTP service: `discover` reads `service.json` from `~/.vaultspec-rag/` (`client.rs:42-53`), `LoopbackTransport` POSTs JSON over `127.0.0.1` (`client.rs:149-201`) under `MAX_RAG_BODY = 16 MiB` (:65) and a wall-clock timeout. The only forwarded verb is `/search` (`search.rs:13`), which passes the rag envelope **verbatim** and adds only a `node_id` annotation — **no vectors**.

## Where embeddings live (rag/qdrant) and how to reach them honestly (HTTP, wheel purity)

Embeddings live **inside the rag-managed Qdrant store**, computed by rag's GPU models, never surfaced today. The live index reports `backend: qdrant-local`, ~1525 vault docs / ~7258 code chunks, `storage_path: http://127.0.0.1:8765` (Qdrant HTTP) distinct from rag `service_port: 8766`. The dense embedder is **`Qwen3-Embedding-0.6B`** with `hidden_size: 1024` — **dense vectors are 1024-dimensional float32** (sparse: `splade-v3`; reranker: `bge-reranker-v2-m3`).

The rag **search response returns no vectors** (per-result `{id, path, title, score, snippet, …}`; rag embeds the *query* server-side and discards the vector after the ANN lookup). There is **no `embeddings`/`vectors` CLI verb** (`vaultspec-rag --help` lists only `benchmark/index/clean/install/uninstall/quality/search/status/test/server/preprocess`).

**Two HTTP-only paths preserve `published-wheel-purity`** (no `vaultspec-rag`/`torch` import; loopback HTTP only):
1. **Qdrant scroll/retrieve with `with_vectors=true`** against `http://127.0.0.1:8765`. Qdrant's REST `/points/scroll` + `/points` return stored vectors by id when `with_vector` is set — reads the *already-stored* document vectors with no re-embedding cost. The engine discovers the Qdrant port (a `service.json`-style read), batch-scrolls vectors keyed by the rag point id, maps to engine node ids via the existing `target_node_id` mapping (`search.rs:23-25`).
2. **A new rag HTTP verb** (`POST /vectors` returning stored dense vectors). Cleaner long-term (engine talks only to rag), but requires a rag-side addition that does not exist today (cross-repo dependency). Per `engine-read-and-infer` any such verb must join the `/ops/rag/*` whitelist and forward verbatim.

Either way the embedding is **read, never computed** in the engine — honoring "The engine builds no embeddings, ever."

## Payload-size analysis vs the bounded-wire rule

Inlining raw 1024-dim float32 vectors at the node ceiling **blows the bounded-wire budget** (`MAX_GRAPH_NODES = 5000`, `graph.rs:51`):
- **Raw float32 JSON, 1024-dim:** ~1024 × ~9 bytes ≈ **9 KB/node**. At 5000 nodes ≈ **45 MB** of embeddings alone — a denial-of-service-class regression on the default view (`graph-queries-are-bounded-by-default`).
- **At a realistic slice** (~1525 vault docs): ~13.7 MB added to a slice otherwise a few hundred KB — 30-50× inflation on the hot path.

Mitigations, ranked:
- **Dedicated endpoint, not inline (strongly recommended).** Serve embeddings from a separate bounded route (`GET /graph/embeddings?scope=…&ids=…`, or a `granularity=document` opt-in `include_embeddings=true`), **never** unconditionally inline in `/graph/query`. Semantic is the *non-default* mode (default `connectivity`); 99% of queries must not pay the tax. The stores layer (sole wire client) fetches lazily only when the user enters semantic mode, and caches.
- **float16 transport (2×):** ~4.5 KB/node, via base64/typed-array binary. Lossy at the 4th decimal — irrelevant to a 2D projection.
- **Server-side PCA-to-K-dims as a *transport* reduction (the tension to resolve in the ADR):** 1024→~32 dims cuts payload ~32× (~280 bytes/node), 2D projection over 32 dims is visually near-identical. **But** this risks crossing `engine-read-and-infer` / `graph-compute-is-cpu`: those put *projection* in the worker. The defensible framing is that a fixed linear reduction *for transport* (compression of a vector the engine reads) differs from computing *layout coordinates* — a genuine gray area the ADR must rule on. **Recommendation: raw/float16 on a dedicated endpoint for v1; defer server-side pre-reduction to a measured trigger.**
- **int8 quantization** is a further ~4× on top of float16; defer unless needed.

**Tiers compliance:** the endpoint must ride the shared envelope helper and carry the `tiers` block (`every-wire-response-carries-the-tiers-block`). Because embeddings come from rag, the semantic tier's availability is the right truth: rag down ⇒ envelope `tiers` reports semantic `Unavailable` (`rag-client/src/lib.rs:20-26`), and the scene reads *that* — never guesses offline from a transport error (`degradation-is-read-from-tiers-not-guessed-from-errors`).

## Projection choice (PCA / UMAP / t-SNE; deterministic, torch-free)

Keep **PCA-to-2D for v1**: deterministic (no stochastic optimizer), torch-free, linear-time for fixed dim, interpretable axes/distances, preserves **global** (inter-cluster) structure — what a "which features cluster near which" constellation needs — and already passes the gate budget. **UMAP** preserves local cluster tightness better and is the literature's semantic-constellation default, but canonical UMAP needs a stochastic optimizer; deterministic UMAP requires PCA/Laplacian-Eigenmap initialization + fixed seed, and the evidence is that the **PCA initialization carries most of the global-structure benefit**. A torch-free JS UMAP (`umap-js`) is feasible but non-trivial to make deterministic and bound inside 250 ms at 1500-5000 nodes. **t-SNE** is the worst fit (non-deterministic, expensive, "exaggerates clusters provably," unreliable for inter-cluster similarity) — decline.

**Recommendation:** PCA-to-2D for v1 once real embeddings flow; treat **deterministic PCA-initialized UMAP** as the `adopt-deferred` upgrade behind the same measured gate, promoted only if a usability check finds PCA's local-cluster compression illegible (matches the ADR ledger: "Semantic UMAP | adopt-v1-gated"; DRGraph as the scale-hardened deferred successor). The engine serves vectors; the worker projects — never the engine.

## Rule-compliance analysis

- **`engine-read-and-infer`:** reading stored vectors over HTTP and forwarding them is read-and-infer; computing them, or computing layout coordinates, is not. **Compliant** if the engine reads-and-forwards. Only risk surface: server-side PCA pre-reduction — defensible as transport compression but must be explicitly ADR-ruled.
- **`published-wheel-purity`:** embeddings arrive over loopback HTTP (8766 or 8765), never a `vaultspec-rag`/`torch` import. The existing `LoopbackTransport` is the sanctioned pattern. **Compliant** with no new Python dependency.
- **`graph-queries-are-bounded-by-default`:** inline embeddings breach the bounded wire (45 MB at the ceiling). **Compliant only with a dedicated, opt-in, bounded endpoint** and/or float16/reduction.
- **`every-wire-response-carries-the-tiers-block`:** the endpoint uses the shared helper and carries `tiers`; an error response (rag down) still carries it. **Compliant by construction.**
- **`degradation-is-read-from-tiers-not-guessed-from-errors`:** scene/stores read semantic-tier availability from `tiers` (rag absent ⇒ fallback ring is *honest absence*, not error). The fallback-ring design already draws embeddingless nodes "honestly aside"; the stores must gate on `tiers`.
- **`dashboard-layer-ownership` / `views-are-projections-of-one-model`:** stores owns the embedding fetch + cache; the scene receives vectors via `SceneController` commands and emits nothing back; chrome never fetches. The embedding is an additive field on the one model, projected by a view. **Compliant.**

## Recommended approach (+ topology fallback)

**Primary path (make semantic real):**
1. **Engine reads vectors from rag over HTTP**, keyed by source → engine node id (reuse `target_node_id`). Prefer a Qdrant scroll-with-vectors against the `storage_path` port, or a new whitelisted `/ops/rag/vectors` verb if rag adds one. The engine computes nothing.
2. **Serve them on a dedicated bounded endpoint** (`GET /graph/embeddings` or `?include_embeddings=true`), through the shared envelope helper with `tiers`, capped at `MAX_GRAPH_NODES`, vectors as **float16/binary** (raw float32 only if simplicity wins for v1). Never inline on the default query.
3. **Stores fetches lazily** on entering semantic mode, caches per generation, feeds vectors to the scene via the existing seam — `adaptGraphSlice` already carries `embedding`, `sceneMapping.ts:24` already maps it, `semanticProjection` already consumes it. **Most of the consumer chain is already built and tested; only the engine producer + bounded transport are missing.**
4. **Keep PCA-to-2D** for v1; **re-run the gate against real served vectors**, not just the synthetic fixture (close the synthetic-only blind spot). Add a real-data separation check.
5. **Honest degradation:** rag down ⇒ `tiers` reports semantic unavailable, endpoint returns no vectors, scene draws the fallback ring as designed (read from `tiers`), and the selector shows semantic as unavailable — never silently ignored.

**Topology fallback (when embeddings are absent or too heavy):** approximate the constellation *without rag embeddings* using **structural embeddings from the graph the engine already holds** — cluster by topology, not text. Options (all torch-free CPU): (a) feature-membership + tier-weighted adjacency as a cheap pseudo-embedding (the salience backbone already computes tier-weighted structure); (b) a classical **spectral / Laplacian-Eigenmap layout** over the declared+structural backbone (the same backbone the layout already uses) — deterministic 2D "meaning-ish" clustering from topology alone; (c) node2vec/DeepWalk structural embeddings (but the representation research notes these "produce *structural* embeddings we largely already encode explicitly," so spectral layout over the existing backbone is the better cheap substitute). A legitimate v1 if real-embedding transport proves too heavy, with rag-embedding semantic mode as the `adopt-deferred` richer upgrade. Must be labelled honestly as topology-based (not text-semantic).

## Open questions for the ADR

- **Embedding source:** direct Qdrant scroll (8765) vs a new whitelisted rag `/vectors` verb (8766)? Former needs no rag change but couples the engine to rag's internal store; latter is cleaner read-and-infer but a non-existent cross-repo dependency.
- **Server-side dimensionality reduction:** is a fixed linear PCA-to-K *for transport* an acceptable "compression of a vector the engine reads" or a forbidden engine projection? The sharpest `engine-read-and-infer` / `graph-compute-is-CPU` boundary call.
- **Transport format:** raw float32 JSON vs float16/base64 binary vs int8 quantized?
- **Endpoint shape:** dedicated `/graph/embeddings` vs an `include_embeddings` flag on `/graph/query`? Both bounded and opt-in.
- **Vector staleness/identity:** rag re-indexes on file change; do served embeddings need a generation/`asof` stamp matching the graph generation? Interaction with `provenance-stable-keys`?
- **Code-node embeddings:** rag indexes ~7258 code chunks too — embed only vault document nodes, or also code nodes, at what id mapping?
- **Gate fix:** re-spec the promotion gate to measure against *real* served embeddings (close the synthetic-only blind spot); what real-data separation floor?
- **Fallback policy:** ship the topology/spectral fallback as v1 semantic and defer rag-embedding mode, or ship rag embeddings directly and use topology only when `tiers` reports rag down?

## References

- `frontend/src/scene/field/semanticLayout.ts:30,42,45,48,56,67-74,93,128,139`; `semanticGate.ts:21,23,27,114,138`; `representationLayout.ts:30,69-74`; `sceneMapping.ts:22-24`.
- `frontend/src/stores/server/engine.ts:412-419`; `liveAdapters.ts:135-155`; `liveAdapters.salience.test.ts:74-82`; `frontend/src/testing/fixtures/corpus.ts:198,295-297,377`.
- `engine/crates/engine-query/src/graph.rs:51,93-122`; `rag-client/src/lib.rs:4-8,20-26`; `rag-client/src/client.rs:42-65,149-201`; `rag-client/src/search.rs:13-34`.
- `[[2026-06-14-graph-representation-adr]]` (§4 embedding-delivery amendment, CPU-projection constraint, v1-gated semantic mode, DRGraph deferred); `[[2026-06-14-graph-node-semantics-adr]]` (§4 amendment as a contract event); `[[2026-06-14-graph-representation-research]]` (UMAP/DRGraph/disparity-filter, torch-free constraint).
- Live rag: `Qwen3-Embedding-0.6B` `hidden_size: 1024`; `splade-v3`; `bge-reranker-v2-m3`; ~1525 vault / ~7258 code; Qdrant `127.0.0.1:8765`, rag `8766`; search returns no vectors; no `embeddings` CLI verb.
- DR tradeoffs: Comparative Analysis of PCA/t-SNE/UMAP; Understanding UMAP (PAIR); "UMAP does not preserve global structure better than t-SNE with the same initialization" (bioRxiv 2019.12.19.877522); "t-SNE Exaggerates Clusters, Provably" (arXiv 2510.07746).
