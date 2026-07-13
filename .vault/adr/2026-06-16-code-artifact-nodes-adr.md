---
tags:
  - "#adr"
  - "#code-artifact-nodes"
date: '2026-06-16'
related:
  - "[[2026-06-16-missing-backend-inventory-research]]"
superseded_by: '2026-07-02-codebase-graphing-adr'
modified: '2026-07-13'
---
# `code-artifact-nodes` adr: `mint inferred code/symbol nodes so structural mentions bridge to navigable graph nodes` | (**status:** `superseded`)

## Context

Structural ingest already extracts and resolves four mention kinds from vault document bodies — `Path`, `StepId`, `WikiLink`, `Symbol` (`ingest-struct/src/extract.rs:15-24`, resolved in `resolve.rs:240-356`) — and mints a `Mentions` structural edge for each (`engine-graph/src/index.rs:943-1000`, `structural_edge_for`). Those edges already address a typed destination node id derived through `CanonicalKey::CodeArtifact` for paths and symbols (`engine-model/src/id.rs:32-35,64-67`): a path mention produces `code:{path}`, a symbol mention produces `code:#{symbol}`. The edge endpoints are correct and stable. **The nodes those endpoints name are never minted.** `graph.upsert_node` is called for documents, plan containers, and rule projections — never for a `code:` target.

The consequence is a navigational dead-end. `engine-query/src/node.rs:375-390` (`bridge_node_id`) computes the correct `code:` id from a resolved target but deliberately returns `None` unless the node already exists, because surfacing a computed id for an unminted node would 404 on `/nodes/{id}` (`vaultspec-api/src/routes/query.rs:580-597`). This is the LENSB-001 / M-B5 fix captured by the adversarial reproduction at `engine-query/tests/bridge_dead_end_repro.rs:51-131`: today a resolved symbol mention correctly carries its human-readable `resolved_target` ("src/graph.rs") but a `null` bridge — the GUI shows the location but clicking goes nowhere. The inventory lists this as Feature E (`[[2026-06-16-missing-backend-inventory-research]]`, `node.rs:367-374`).

A related disjointness exists for `StepId` mentions: `structural_edge_for` derives `NodeId::derive(&NodeKind::PlanContainer, s)` from the bare canonical id (`index.rs:967`), yielding `plan:W01.P02.S03` — which is NOT the real plan-container id (`plan:{plan_stem}/W01/P02/S03`, minted by `mint_plan_containers`). Step mentions therefore also dead-end, and `bridge_node_id` does not attempt to bridge them. This ADR scopes that out (D1) but names it so the plan inherits the boundary.

The minting precedent is established: `mint_plan_containers` (`index.rs:690-800`) and `project_rules` (`index.rs:429-518`) already mint *inferred-cache* nodes (not vault documents) with stable identity-bearing ids, per-scope facets, and subordinate edges, all under the read-and-infer fence. Code-artifact nodes are the same species of inferred projection over a source the engine reads but does not own.

The constraints: the engine must never write `.vault/` or mutate git (`engine-read-and-infer`); a code node's id must be identity-bearing and survive re-resolution without re-keying (`provenance-stable-keys-are-identity-bearing`); new nodes must not bloat the bounded constellation slice (`graph-queries-are-bounded-by-default`, `MAX_GRAPH_NODES=5000`); compute stays CPU-side (`graph-compute-is-cpu-gpu-is-render-and-search`); and every wire response keeps the tiers block (`every-wire-response-carries-the-tiers-block`).

## Decision

**D1 — v1 scope: mint `code:` nodes for resolved/stale Path and Symbol mentions; defer StepId re-keying and broken targets.** The mentions whose edges already address a `CanonicalKey::CodeArtifact` destination — `Path` and `Symbol` — get their destination node minted, but only when the resolver assigned `Resolved` or `Stale` state. `Broken` mentions mint no node: a broken edge is retained signal pointing at a target the tree cannot produce, and minting a node for a non-existent file would fabricate a navigable artifact for something absent. `StepId` bridging is out of v1 scope (it requires reconciling `plan:W01.P02.S03` with `plan:{plan_stem}/W01/P02/S03`, a distinct identity reconciliation belonging to the plan-container feature). `WikiLink` mentions already bridge to real document nodes. *Verdict: accept.* Rationale: the smallest v1 that closes the dead-end for the two kinds whose endpoints are already code ids, without fabricating nodes for absent targets or entangling the orthogonal step-id reconciliation.

**D2 — A code-artifact node is a first-class `NodeKind::CodeArtifact` graph node, not a new lightweight kind.** `NodeKind::CodeArtifact` already exists (`engine-model/src/lib.rs:36-37`) and `bridge_node_id` already computes its id (`node.rs:384-388`). The node carries the same `Node` shape every species uses — kind, key, an optional `doc_type` of `"code"` as its species handle (mirroring `project_rules`' `doc_type: "rule"`), and a per-scope `Facet` with `Presence::Exists`. It carries no lifecycle (a source file has no pipeline state) and no `status`/`tier`. *Verdict: accept.* Rationale: a parallel lightweight kind would re-fork the node view, ontology, bounding, and wire for no gain; the existing kind already fits and keeps one node model.

**D3 — Stable identity is `node_id(&CanonicalKey::CodeArtifact { path, symbol })`, derived from the resolved target, resolution-state-free.** The id is composed only from what the artifact *is*: its repo-relative path (and, for a symbol, the `#symbol` qualifier) — never from the resolution state, the mentioning document, the byte span, or the rag index. The mint key is taken from the resolver's `resolved_target` (the actual live path), so a `Stale` mention mints the node at the path that exists, identical to where the bridge already points. Re-indexing re-derives the identical id; a broken→resolved or resolved→stale transition changes the edge's `state` facet and the set of minted nodes, but never re-keys an existing code node. *Verdict: accept.* Rationale: reuses the existing canonical key, derives identity from the artifact not the mention, and is byte-stable across re-index — the re-derivability invariant holds.

**D4 — No relation to or reuse of the rag codebase index.** The rag codebase index (~7258 chunks) is reached only over rag's loopback HTTP service for semantic search; its chunk ids are ephemeral search results, not stable graph identity, and the engine builds no embeddings. Code-artifact node identity is derived independently from the path/symbol the structural resolver already produced on-CPU during ingest. The two indices stay disjoint. *Verdict: accept.* Rationale: coupling graph identity to rag chunk ids would make a CPU read-and-infer structural fact depend on an optional GPU sibling and a wheel-forbidden dependency.

**D5 — Minting happens in `engine-graph` `index.rs`, in the existing serial edge-ingest pass (Pass 2), driven by the already-resolved mentions.** For each resolved Path/Symbol mention with a `Resolved`/`Stale` state, `upsert_node` the `code:` target (carrying the request scope's facet) beside the edge that addresses it. Minting is idempotent by id (`upsert_node` merges facets), so re-ingestion converges. Resolution stays in the existing parallel batch; only the cheap upsert is added to the serial pass. With the node present, `bridge_node_id` resolves the same id it already computes and `/nodes/{id}` no longer 404s — no change to `bridge_node_id` itself is required. *Verdict: accept.* Rationale: `ingest-struct` is the pure extractor/resolver with no graph handle and no scope; `engine-graph` `index.rs` already owns node minting and already mints two other inferred-node species there. Minting beside the edge keeps node and endpoint provably consistent.

**D6 — Bounded-wire policy: code nodes are document-granularity-only and excluded from the feature constellation; the existing `MAX_GRAPH_NODES` cap governs them.** Code-artifact nodes carry no `feature_tags`, so the feature-granularity projection (`feature_nodes`, `graph.rs:172-230`) never includes them — the default constellation LOD is untouched. At document granularity they join the scope-faceted node pool already bounded by `MAX_GRAPH_NODES=5000` with honest `truncated` reporting; the self-consistency retain already drops edges to dropped nodes. Code nodes are opt-in by descent (visible at document granularity or via `/nodes/{id}/neighbors` ego expansion), never pushed into the always-on constellation. *Verdict: accept.* Rationale: reuses the existing bound rather than inventing a new one, keeps the unbounded-safe constellation default cheap, and matches how plan-container nodes (also feature-tagless) already behave.

**D7 — No wire/contract amendment is required; the change is additive and non-id-bearing for existing edges.** The wire node and edge shapes are unchanged: `code:` nodes serialize through the same `node_view`; the `NodeKind::CodeArtifact` variant and the `code:` id form already exist on the contract (`id.rs:230-242` test pins them). No existing edge id changes — `structural_edge_for` already emitted these endpoints, so only the *node set* grows. `bridge_node_id` flips from `null` to a real id for affected `CodeLocation`s (additive, the field's documented purpose). The tiers block rides every response unchanged. *Verdict: accept.* Rationale: the contract already anticipated this node kind; v1 fills it in. The one observable change — bridges becoming navigable — is intended, and the `bridge_dead_end_repro` assertion inverts from `None`-expected to id-expected (a test update, not a contract break).

## Decision ledger

| # | Decision | Verdict |
|---|----------|---------|
| D1 | Mint `code:` nodes for resolved/stale Path + Symbol mentions; defer StepId bridging and broken-target nodes | accept |
| D2 | First-class `NodeKind::CodeArtifact`, not a new lightweight kind | accept |
| D3 | Stable id = `CanonicalKey::CodeArtifact { path, symbol }` from the resolved target; resolution-state-free | accept |
| D4 | No reuse of / coupling to the rag codebase index; identity derived independently on-CPU | accept |
| D5 | Mint in `engine-graph` `index.rs` Pass 2 from already-resolved mentions; idempotent `upsert_node` | accept |
| D6 | Document-granularity-only; excluded from the feature constellation; governed by `MAX_GRAPH_NODES` | accept |
| D7 | No contract amendment; additive node set, non-id-bearing for existing edges | accept |

## Consequences

- **Bridges become navigable.** A resolved/stale Path or Symbol mention's `CodeLocation.bridge_node_id` flips from `null` to a real `code:` id; `/nodes/{id}` returns the node's context bundle instead of 404. The `bridge_dead_end_repro` expectation inverts; a new repro asserts the still-`None` bridge for a `Broken` mention.
- **The graph grows by the count of distinct resolved/stale code targets**, deduplicated by id across mentioning documents (a file mentioned by ten docs is one node with ten inbound `Mentions` edges). At document granularity this counts against `MAX_GRAPH_NODES`; the cap and its honest truncation already govern it. The constellation is unaffected.
- **Node detail is thin** — inbound `Mentions` edges (which documents mention this file/symbol), no interior, no lifecycle. A genuinely useful "every document that mentions this artifact" affordance.
- **Symbol nodes are coarse in v1** (qualified-name text match, `resolve.rs:316-356`), the same v1 limitation the resolver carries; tree-sitter-grade definition-site identity is a v2 upgrade the canonical key already accommodates without a re-key.
- **Re-derivability holds.** Minting is idempotent and identity-bearing, so `full_index` from a deleted cache converges to the identical graph including code nodes.

## Alternatives considered

- **Mint lazily on `/nodes/{id}` (synthesize-on-fetch).** Rejected: splits identity minting from ingest, leaves the graph query blind to code nodes, and breaks re-derivability (the graph would differ by which nodes had been fetched).
- **A new lightweight `CodeRef` kind.** Rejected (D2): forks the node view, ontology, bounding, and wire for no benefit when `NodeKind::CodeArtifact` already exists and the bridge already targets it.
- **Reuse rag chunk ids as identity.** Rejected (D4): couples a CPU read-and-infer fact to an optional GPU sibling, violates `graph-compute-is-cpu` and `published-wheel-purity`.
- **Mint nodes for broken mentions too.** Rejected (D1): fabricates a navigable artifact for an absent target; the broken edge with a `null` bridge is the honest state.
- **Include code nodes in the feature constellation.** Rejected (D6): code artifacts are not features; would bloat the unbounded-safe default. Descent reveals them.

## Constraints & rule compliance

- **`engine-read-and-infer`:** code-artifact nodes are inferred cache re-computed from documents the engine reads; nothing is written to `.vault/`, no git ref mutated, fully deletable and re-derivable — identical posture to the plan-container and rule-projection nodes minted in the same file.
- **`provenance-stable-keys-are-identity-bearing`:** the node id is composed only from path/symbol (D3), never from resolution state, mentioning document, or rule outcome; re-resolution updates edge state and the minted-node set without re-keying any code node.
- **`graph-queries-are-bounded-by-default`:** code nodes are excluded from the constellation LOD and governed at document granularity by the existing `MAX_GRAPH_NODES` cap with honest `truncated` reporting (D6).
- **`graph-compute-is-cpu-gpu-is-render-and-search`:** minting is a cheap CPU `upsert_node` in the existing serial pass; no layout, no GPU, no embedding.
- **`every-wire-response-carries-the-tiers-block`:** no new front door and no hand-built envelope; existing routes serve the new nodes through the shared envelope unchanged.
- **`views-are-projections-of-one-model`:** one node model grows by one already-declared kind; the GUI projects over it (descent, ego, evidence) with no new fetch path or node schema.

## Open questions deferred to the plan

- **StepId bridge reconciliation.** Whether to reconcile the bare-id step-mention target onto the real plan-container node, and whether that belongs here or in the plan-container feature. Named in D1 as out of v1 scope; the plan records the boundary so the dead-end is not silently re-introduced.
- **Symbol node granularity.** Whether a v1 symbol node is path-anchored (`code:{path}#{symbol}`) or name-only (`code:#{symbol}`, the current edge endpoint). The edge currently emits the name-only form; minting the verbatim current endpoint keeps the change non-id-bearing (recommended); upgrading the endpoint to the path-anchored form is an edge-id change requiring a contract-review event.
- **Document-slice code-node filtering.** Whether to add a `kinds:` filter on `/graph/query` to suppress code nodes within a narrowed document slice, or rely on descent/ego scoping alone.
- **`bridge_dead_end_repro` test inversion + a new broken-target repro** to lock in the truthful-absence boundary from D1.
- **Cold-index cost measurement** via the engine `scale_bench` to confirm the added upserts leave the linear cold-index profile intact at corpus scale.

## Sources

- `[[2026-06-16-missing-backend-inventory-research]]` (Feature E row; the `bridge_node_id` None gap).
- Engine code: `engine-query/src/node.rs:360-390` (`bridge_node_id`, `CodeLocation`, `evidence`), `:21-23` (`node_detail`); `engine-graph/src/index.rs:943-1000` (`structural_edge_for`, the `code:`/`plan:` endpoints already emitted), `:690-800` (`mint_plan_containers` precedent), `:429-518` (`project_rules` precedent), `:363-402` (Pass 2 serial edge ingest, the mint site); `engine-graph/src/graph.rs:62-83` (idempotent `upsert_node`); `engine-model/src/id.rs:32-35,64-67,84-87` (`CanonicalKey::CodeArtifact`, `node_id`); `engine-model/src/lib.rs:36-37` (`NodeKind::CodeArtifact`); `ingest-struct/src/extract.rs:15-24` (`MentionKind`); `ingest-struct/src/resolve.rs:240-356` (resolution states + `resolved_target`); `engine-query/src/graph.rs:51,60-82,172-230,289-352` (`MAX_GRAPH_NODES`, `bound_slice`, `feature_nodes`, granularity); `vaultspec-api/src/routes/query.rs:580-597` (`/nodes/{id}` that 404s today); `rag-client/src/lib.rs:1-15` (rag is search-only).
- Test: `engine-query/tests/bridge_dead_end_repro.rs:51-131` (the M-B5 / LENSB-001 reproduction whose assertion this feature inverts).
- Rules: `engine-read-and-infer`, `provenance-stable-keys-are-identity-bearing`, `graph-queries-are-bounded-by-default`, `graph-compute-is-cpu-gpu-is-render-and-search`, `every-wire-response-carries-the-tiers-block`, `views-are-projections-of-one-model`, `published-wheel-purity`.
