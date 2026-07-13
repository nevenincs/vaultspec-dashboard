---
tags:
  - '#adr'
  - '#graph-semantic-embeddings'
date: '2026-06-16'
modified: '2026-07-13'
related:
  - "[[2026-06-16-graph-semantic-embeddings-research]]"
  - "[[2026-06-14-graph-representation-adr]]"
---

# `graph-semantic-embeddings` adr: `serving rag embeddings on a bounded, tiers-gated endpoint so the meaning constellation becomes real` | (**status:** `accepted`)

## Context

The dashboard's `semantic` representation mode is meant to be a meaning constellation — nodes spatialized by embedding similarity so meaning-clusters separate. In the running app every node instead collapses onto a single stable circle. The research (`[[2026-06-16-graph-semantic-embeddings-research]]`) pins the cause to one missing wire field, not a projection bug: `semanticProjection` partitions nodes into `embedded` and `fallback` by `Array.isArray(n.embedding) && n.embedding.length > 0` (`frontend/src/scene/field/semanticLayout.ts:42-48`); the live engine serves `embedding` on no node, so every node falls into `fallback` and rings `SEMANTIC_FALLBACK_RADIUS = 760` (`semanticLayout.ts:30`). The consumer chain is already built and tested end to end — `EngineNode.embedding?: number[]` is the declared §4-amendment seam (`engine.ts:419`), `adaptGraphSlice` carries it through via `...rest` (`liveAdapters.ts:142-154`), `sceneMapping.ts:24` maps it, and `projectTo2D` (`semanticLayout.ts:93`) is a correct, deterministic, torch-free PCA-to-2D. Only the engine producer and the bounded transport are missing.

The mode appears to "work" only because of the mock-vs-live split `mock-mirrors-live-wire-shape` warns about: the mock corpus seeds synthetic clustered 8-float embeddings (`corpus.ts:198,295-297`), so consumer tests pass while the live origin serves nothing. The promotion gate compounds this: `SEMANTIC_MODE_GATE` (`semanticGate.ts:138`) measures projection time and cluster separation on a **synthetic** ceiling-sized fixture (`buildGateSlice(1500, 8)`), never on real served data — so it can report "shipped" while the real path produces the fallback ring.

Embeddings exist, computed by rag's GPU models and stored in the rag-managed Qdrant instance, never surfaced. The live index reports the dense embedder `Qwen3-Embedding-0.6B` with `hidden_size: 1024` (dense vectors are **1024-dim float32**), Qdrant HTTP at `127.0.0.1:8765`, rag's own service at `8766`, ~1525 vault docs and ~7258 code chunks. The rag `/search` response returns no vectors, and there is no `embeddings`/`vectors` CLI verb. The engine's rag client reaches rag strictly over loopback HTTP (`rag-client/src/client.rs`), forwarding only `/search` verbatim and adding a `node_id` annotation (`search.rs`); its own header asserts "The engine builds no embeddings, ever" (`lib.rs:8`).

This ADR extends the `[[2026-06-14-graph-representation-adr]]` §4 embedding-delivery amendment (the engine serves the rag embedding vectors as an optional additive node field or a paired bounded endpoint; the worker runs UMAP; the engine never serves coordinates). The semantic mode is `adopt-v1-gated` and DRGraph is `adopt-deferred` in that ADR's ledger. The decisive constraints are `published-wheel-purity` (no rag/torch runtime import; loopback HTTP only), `engine-read-and-infer` (read-and-forward, never compute), `graph-queries-are-bounded-by-default` (45 MB of inline vectors at the 5000-node ceiling is a DoS-class regression), `every-wire-response-carries-the-tiers-block`, `degradation-is-read-from-tiers-not-guessed-from-errors`, and `graph-compute-is-cpu-gpu-is-render-and-search`.

## Decision

**D1 — Embedding source: direct Qdrant scroll-with-vectors (port 8765) is the canonical, expected design (not a stopgap).** The engine reads stored dense vectors from rag's Qdrant over loopback HTTP `POST /collections/{c}/points/scroll` (and `/points` by id) with `with_vector=true`, against the `storage_path` port discovered the same `service.json` way the rag client already discovers rag (`client.rs:42-53`). This reads already-stored vectors with **zero re-embedding cost** and requires no cross-repo change. The coupling to rag's internal store shape (collection name, point-id scheme) is **accepted as the intended design**, isolated behind the rag-client crate. The previously-considered `/ops/rag/vectors` rag verb is **dropped** — it is not a migration target; direct Qdrant scroll is the design we build to and keep. **The engine reads, never computes** — "The engine builds no embeddings, ever" holds. *Verdict: adopt (direct Qdrant scroll, canonical).*

**D2 — Endpoint shape: a dedicated bounded `GET /graph/embeddings` route; never an unconditional inline on `/graph/query`.** Embeddings ride a separate route keyed by scope and the served node-id set, capped at `MAX_GRAPH_NODES = 5000` (`graph.rs:51`) with the same `bound_slice`/`truncated` honesty. Semantic is the **non-default** mode, so 99% of queries must not pay the embedding tax; an `include_embeddings=true` flag on `/graph/query` is rejected for v1 because it couples the embedding fetch to every constellation query and complicates the hot path's caching. The stores layer (sole wire client) fetches `/graph/embeddings` **lazily, only on entering semantic mode**, and caches per generation. *Verdict: adopt-v1 (dedicated route); decline-for-v1 (inline flag).*

**D3 — Transport format: raw float32 JSON arrays for v1; float16/base64-binary is the deferred 2× upgrade behind a measured payload trigger.** v1 serves vectors as JSON `number[]` — the shape `EngineNode.embedding?: number[]` already declares and the consumer chain already parses, zero adapter/scene change. At ~9 KB/node over a realistic ~1525-doc slice this is ~13.7 MB on a dedicated, opt-in, cached, semantic-only route — acceptable off the default path. float16 base64-binary (~4.5 KB/node, lossless to a 2D projection) is `adopt-deferred`; int8 quantization is a further deferred step. *Verdict: adopt-v1 (float32) + adopt-deferred (float16) + decline-for-v1 (int8).*

**D4 — Server-side dimensionality reduction for transport is FORBIDDEN in v1; the engine serves the raw 1024-dim vector and the worker projects.** A fixed linear PCA-to-K would cut payload ~32×, and one could argue it is "compression of a vector the engine reads." We **rule it a forbidden engine projection** for v1: `graph-compute-is-cpu-gpu-is-render-and-search` places *all* projection in the scene worker and names the engine read-and-infer; a PCA basis fit is a computed transform over the corpus, not a forwarded fact, and `engine-read-and-infer`'s test is "reading stored vectors and forwarding them is read-and-infer; computing them is not." It also introduces a hidden regenerable derived artifact whose staleness must be tracked separately. The bounded route (D2) plus deferred float16 (D3) solves the payload problem honestly without it. Reconsiderable only if a measured trigger shows float16-on-a-bounded-route still breaches the budget, and even then as an explicit contract amendment. *Verdict: decline-for-v1.*

**D5 — Projection stays PCA-to-2D in the worker for v1; deterministic PCA-initialized UMAP is `adopt-deferred`.** Keep `projectTo2D` unchanged: deterministic (sin-seeded power iteration, no `Math.random`), torch-free, linear in fixed dim, preserves global inter-cluster structure — what a "which features cluster near which" constellation needs — and already inside the gate budget. UMAP is `adopt-deferred` behind the same measured gate, promoted only if a real-data usability check finds PCA's local-cluster compression illegible. t-SNE is declined (non-deterministic, exaggerates clusters, poor inter-cluster fidelity). The engine serves vectors; the worker projects — never the engine. *Verdict: adopt-v1 (PCA-2D) + adopt-deferred (PCA-init UMAP) + decline (t-SNE).*

**D6 — Re-spec the promotion gate to measure against real served embeddings, closing the synthetic-only blind spot.** `SEMANTIC_MODE_GATE` is re-specified so its separation and a new data-presence criterion run against a captured real served slice — vectors fetched from the live `/graph/embeddings` route through the same `adaptGraphSlice`/`sceneMapping` path the app uses (the `mock-mirrors-live-wire-shape` discipline). The synthetic `buildGateSlice` fixture is retained only as the projection-time budget measurement; the "shipped" verdict additionally requires real served embeddings present and separating above a real-data floor (a plan-time calibration starting at the synthetic `1.2`). The gate cannot report "shipped" on a path that delivers no embeddings. *Verdict: adopt-v1.*

**D7 — Honest degradation: semantic availability is read from the `tiers` block, never guessed from a transport error.** `/graph/embeddings` is built through the shared envelope helper and carries the `tiers` block on every response, success and error. Because embeddings come from rag, the semantic tier's availability is the truth: rag/Qdrant down ⇒ the envelope `tiers` reports semantic `Unavailable` with the `degradation_reason`, the endpoint returns no vectors, and the stores layer marks semantic unavailable **from that tiers truth** (fresh error tiers winning), never from a bare fetch rejection. The scene draws the fallback ring as designed (honest absence, not error), and the selector shows semantic unavailable rather than silently downgrading. *Verdict: adopt-v1.*

**D8 — Vector identity carries the graph generation as an `asof`/generation stamp; it is NOT folded into any node or edge stable key.** The `/graph/embeddings` response carries the graph generation stamp it was read at (the same generation `/graph/query` echoes), so the stores layer caches vectors per generation and re-fetches on generation change. The embedding is **not** threaded into any node id or edge stable key (`provenance-stable-keys-are-identity-bearing`): a re-index that shifts a vector must not re-key a node and make the diff clock see phantom remove/add pairs. The vector is a value on a stably-keyed node, exactly as `salience` and `status_value` are additive projections that do not touch the node id. *Verdict: adopt-v1.*

**D9 — Topology/spectral fallback is `adopt-deferred`, NOT v1; v1 ships real rag embeddings and uses topology only via the honest tiers-down fallback ring.** Shipping a spectral/Laplacian-Eigenmap topology layout as v1 semantic would mean the headline mode is topology-clustered (structure we largely already encode), mislabeled as text-semantic, and duplicating the connectivity mode's job. v1's degraded state is the honest fallback ring read from `tiers` (D7). A topology-based "structural meaning" mode is recorded `adopt-deferred`, to be added as a distinct, honestly-labeled mode if a real need surfaces — never a silent substitute for the semantic mode. *Verdict: adopt-deferred.*

**D10 — v1 scope is vault-document node embeddings only; code-node embeddings are `adopt-deferred`.** v1 serves embeddings only for document nodes, mapped via the existing `target_node_id` correlation (vault stem → `doc:` node). Code-node embeddings are deferred: code chunks are sub-document (chunk → node aggregation is ambiguous), the constellation's first task is the vault second-brain, and ~7258 more vectors push the realistic slice toward the ceiling for a v1 with no surfaced consumer. The id-mapping seam makes code embeddings a clean later addition. *Verdict: adopt-deferred.*

## Decision ledger

| ID | Decision | Verdict | Reason |
|---|---|---|---|
| D1 | Source = Qdrant scroll-with-vectors (8765), canonical design | adopt | no rag change; reads stored vectors at zero re-embed cost; the intended permanent seam |
| D1′ | Source = whitelisted rag `/ops/rag/vectors` verb (8766) | dropped | not a migration target; direct Qdrant is the expected design |
| D2 | Dedicated bounded `GET /graph/embeddings` route | adopt-v1 | semantic is non-default; keep the hot path untaxed |
| D2′ | `include_embeddings` flag on `/graph/query` | decline-for-v1 | couples embedding fetch to every constellation query |
| D3 | Transport = raw float32 JSON `number[]` | adopt-v1 | matches the already-typed seam; off the default path |
| D3′ | float16 base64-binary transport (2×) | adopt-deferred | promote on a measured payload/latency trigger |
| D3″ | int8 quantization | decline-for-v1 | unneeded until float16 proves insufficient |
| D4 | Server-side PCA-to-K reduction for transport | decline-for-v1 | computed projection in the engine; D2+D3 solve payload honestly |
| D5 | Projection = PCA-to-2D in the CPU worker | adopt-v1 | deterministic, torch-free, global-structure, in-budget |
| D5′ | Deterministic PCA-init UMAP | adopt-deferred | promote if real-data PCA cluster legibility fails |
| D5″ | t-SNE | decline | non-deterministic; exaggerates clusters |
| D6 | Re-spec gate to measure real served embeddings | adopt-v1 | gate can't ship an empty path |
| D7 | Tiers-gated semantic availability; fallback ring from `tiers` | adopt-v1 | honest degradation |
| D8 | Generation/`asof` stamp on vectors; NOT in any stable key | adopt-v1 | staleness without re-keying |
| D9 | Topology/spectral fallback as a distinct mode | adopt-deferred | v1 ships real embeddings; topology not a silent substitute |
| D10 | Vault-doc node embeddings only | adopt-v1 | first task is the vault second-brain |
| D10′ | Code-node embeddings | adopt-deferred | chunk→node aggregation + ceiling pressure |

## Consequences

The semantic mode becomes real: entering it triggers a lazy, cached `/graph/embeddings` fetch; vault-document nodes carry their rag dense vector; the worker PCA-projects them into a meaning cloud; embeddingless nodes still ring the fallback radius, now a minority honest-absence set rather than the entire graph. The default `connectivity` path pays nothing. The consumer chain ships unchanged; the work is concentrated in the engine producer (a new bounded route + a Qdrant scroll-with-vectors read in `rag-client`) and the gate re-spec.

The engine gains a coupling to rag's Qdrant store shape, isolated behind `rag-client` and reversible to the `/ops/rag/vectors` verb. Served vectors carry a generation stamp so the client re-fetches rather than diffing stale vectors into phantom changes; node identity is untouched. The mock must serve the `/graph/embeddings` shape byte-for-byte, and a consumer test must feed a captured live sample through `adaptGraphSlice` so the gate and projection are verified against reality. Deferred upgrades (float16, PCA-init UMAP, code-node embeddings, the rag verb, the topology mode) are decided-in behind measured triggers, so a later agent extends rather than re-litigates.

## Alternatives considered

- **Inline embeddings unconditionally on `/graph/query`** — rejected: ~45 MB at the ceiling is a DoS-class regression; the default mode never needs vectors.
- **A new rag `/vectors` verb for v1** — rejected for v1 as a cross-repo dependency that does not exist; it is the deferred clean-coupling target (D1′).
- **Server-side PCA-to-K reduction for transport** — rejected (D4): a computed projection inside the engine; unnecessary given a bounded route + deferred float16.
- **Importing `vaultspec-rag`/torch to read vectors in-process** — rejected outright: `published-wheel-purity` forbids it; loopback HTTP is the sanctioned pattern.
- **Shipping the spectral/topology fallback as v1 semantic** — rejected (D9): clusters by structure we already encode, mislabels topology as text-semantics, overlaps connectivity.
- **Re-embedding documents in the engine** — rejected: contradicts "builds no embeddings, ever"; vectors are read from Qdrant at zero compute cost.

## Constraints & rule compliance

- **`published-wheel-purity`** — embeddings arrive over loopback HTTP (Qdrant 8765, or rag 8766 deferred), never a `vaultspec-rag`/torch import. Compliant.
- **`engine-read-and-infer`** — the engine reads stored vectors and forwards them verbatim; it computes neither vectors nor coordinates (D4 forbids server-side reduction). Compliant.
- **`graph-compute-is-cpu-gpu-is-render-and-search`** — projection stays in the scene CPU worker; the engine serves no coordinates. Compliant.
- **`graph-queries-are-bounded-by-default`** — vectors serve only on a dedicated, opt-in route capped at `MAX_GRAPH_NODES` with `truncated` honesty; the default query is untaxed. Compliant.
- **`every-wire-response-carries-the-tiers-block`** — `/graph/embeddings` uses the shared envelope helper; success and rag-down error both carry `tiers`. Compliant by construction.
- **`degradation-is-read-from-tiers-not-guessed-from-errors`** — stores reads semantic availability from the `tiers` block (fresh error tiers winning), never from a bare transport failure. Compliant.
- **`provenance-stable-keys-are-identity-bearing`** — the embedding is an additive value on a stably-keyed node; it enters no stable key, so a re-index re-keys nothing (D8). Compliant.
- **`dashboard-layer-ownership` / `views-are-projections-of-one-model`** — stores owns the lazy fetch and per-generation cache; the scene receives vectors via `SceneController` and emits nothing back; chrome never fetches. Compliant.
- **`mock-mirrors-live-wire-shape`** — the mock must serve the `/graph/embeddings` shape exactly, and a consumer test must feed a captured live sample through the real client path (D6). Compliant by mandate.

## Open questions deferred to the plan

- Exact Qdrant scroll API shape: collection name(s), the rag point-id → `target_node_id` mapping (confirm the stored point payload carries the stem/source), batch size, and how a missing point (graph doc not yet in Qdrant) renders (honest absence → fallback ring).
- The real-data separation floor and data-presence threshold for the re-spec'd gate (D6).
- The `/graph/embeddings` request contract: id-set echo vs scope+lens re-selection, kept consistent with `/graph/query`'s DOI selection so the embedding set matches the served node set.
- Generation-stamp interaction with the SSE delta clock: full re-fetch per generation for v1; incremental vector delta is a later optimization.
- The float16 transport trigger threshold (D3′).
- Whether the rag-client embedding read inherits the `MAX_RAG_BODY` cap and a wall-clock deadline (the `subprocess-calls-carry-cap-and-timeout` analog for an HTTP read).

## Sources

- `[[2026-06-16-graph-semantic-embeddings-research]]` — unserved-embedding root cause, Qdrant/rag analysis, payload-size analysis, projection choice, rule compliance, topology fallback, open questions.
- `[[2026-06-14-graph-representation-adr]]` — §4 embedding-delivery amendment seam; semantic mode `adopt-v1-gated`, DRGraph `adopt-deferred`; CPU-projection constraint.
- Code: `frontend/src/scene/field/semanticLayout.ts:30,42-48,56,93,128,139`; `semanticGate.ts:21,23,27,42,114,138`; `representationLayout.ts:69-74`; `frontend/src/stores/server/engine.ts:411-419`; `liveAdapters.ts:135-155`; `engine/crates/engine-query/src/graph.rs:51,60-82,91-122`; `engine/crates/rag-client/src/lib.rs:8,20-26`, `client.rs:42-53,65`, `search.rs:13-45`, `discover.rs:116-134`.
- Rules: `published-wheel-purity`, `engine-read-and-infer`, `graph-compute-is-cpu-gpu-is-render-and-search`, `graph-queries-are-bounded-by-default`, `every-wire-response-carries-the-tiers-block`, `degradation-is-read-from-tiers-not-guessed-from-errors`, `provenance-stable-keys-are-identity-bearing`, `dashboard-layer-ownership`, `mock-mirrors-live-wire-shape`.
