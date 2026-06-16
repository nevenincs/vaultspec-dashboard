---
tags:
  - '#plan'
  - '#graph-viz-framework'
date: '2026-06-16'
modified: '2026-06-16'
tier: L3
related:
  - '[[2026-06-16-graph-force-stability-adr]]'
  - '[[2026-06-16-graph-layout-catalog-adr]]'
  - '[[2026-06-16-graph-lineage-dag-adr]]'
  - '[[2026-06-16-graph-semantic-embeddings-adr]]'
  - '[[2026-06-16-code-artifact-nodes-adr]]'
  - '[[2026-06-14-dashboard-git-diff-browser-adr]]'
  - '[[2026-06-16-missing-backend-inventory-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `graph-viz-framework` plan

## Wave `W01` - graph-force-stability: incremental reheat, held-alphaTarget interaction, drag-to-pin

Scene-only stability and interactive-fidelity follow-on to the d3-force connectivity driver, implementing graph-force-stability-adr D1-D8. Independent of all other waves (no engine, no wire, no stores fetch). Delivers incremental-reheat routing, the beginInteraction/endInteraction held-warmth seam, Obsidian-grade drag-to-pin, per-node collision, velocity/dwell freeze, double-init/double-fit collapse, and a freeze toggle.

Seven feature Waves converging the graph-viz ADR set: a stable customizable
information-rich connected-graph viz (force stability, layout catalog, lineage DAG,
semantic embeddings, code-artifact nodes) plus the stranded git-diff wiring and a
backend cleanup pass.

GLOBAL CONSTRAINT — NO BACKWARDS COMPATIBILITY: deprecated paths, dead code, and
stale fallbacks are removed outright, never maintained behind compat or tolerant
layers. When a new shape replaces an old one, the old one is deleted (mock and live
move together per mock-mirrors-live-wire-shape). The semantic mode reads embeddings
via DIRECT Qdrant scroll (the canonical, expected design — there is no rag-`/vectors`-
verb migration path). The fallback ring for embeddingless nodes is honest degradation,
not backwards-compat, and stays.

### Phase `W01.P01` - incremental-reheat boundary and held-warmth interaction seam

Route content deltas through applyChanges at a low reheat and add the driver's interaction-active alphaTarget hold (D1, D2).

- [ ] `W01.P01.S01` - Add INCREMENTAL_REHEAT_ALPHA (~0.15) and INTERACTION_ALPHA_TARGET (~0.1) constants and lower applyChanges reheat ceiling from WARM_START_ALPHA to INCREMENTAL_REHEAT_ALPHA per D1; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `W01.P01.S02` - Route set-data deltas through a node/edge diff to applyChanges when the surviving id intersection is non-empty and no scope or mode swap is in flight, reserving full init plus warm start for first load, scope swap, and representation-mode change per D1; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W01.P01.S03` - Route served-node-set filter changes through applyChanges and keep visibility-only filter changes on the set-visibility path so filters never re-init per D1; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W01.P01.S04` - Add driver beginInteraction and endInteraction that set and clear alphaTarget, and make setParams skip the alpha-floor kick while interaction is active per D2; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `W01.P01.S05` - Coalesce set-layout-params across a slider drag, firing beginInteraction on first onChange and endInteraction on pointerup with a trailing debounce for keyboard slider steps per D2; `frontend/src/app/stage/GraphControls.tsx`.

### Phase `W01.P02` - drag-to-pin gesture and per-node collision

Add the PointerGestures node-drag branch and the assembly-owned per-node collision radius callback (D3, D4).

- [ ] `W01.P02.S06` - Add a node-drag branch to PointerGestures: record a pending node-drag on pointer-down hit-test, diverge to node-drag past the 4px DRAG_THRESHOLD when a node was hit on down, keep empty-canvas-on-down as camera pan, and keep a below-threshold node press a select per D3; `frontend/src/scene/field/camera.ts`.
- [ ] `W01.P02.S07` - Add nodeDragTo(id,worldX,worldY) and nodeDragEnd(id,moved) to the GestureCallbacks interface per D3; `frontend/src/scene/field/camera.ts`.
- [ ] `W01.P02.S08` - Implement the gesture callbacks in the assembly: a driver dragNode(id,x,y) that sets fx/fy and ensures beginInteraction, and route the sticky pin on drag-end through the existing set-pinned pins-store path per D3; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W01.P02.S09` - Replace fixed COLLIDE_RADIUS=18 with a radiusOf(id) callback passed into the driver at init and applyChanges, falling back to the fixed radius when the callback is absent per D4; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `W01.P02.S10` - Supply the radiusOf callback from the assembly as nodeRadius(model.nodeById(id)) plus COLLIDE_PAD, sharing the salience-driven sprite radius without importing nodeRadius into the driver per D4; `frontend/src/scene/field/fieldAssembly.ts`.

### Phase `W01.P03` - settle-freeze, double-init/double-fit collapse, freeze toggle

Add velocity/dwell early freeze, collapse the mount-time double-init and double-fit, and expose the freeze/unfreeze toggle (D5, D6, D7).

- [ ] `W01.P03.S11` - Add an early settle-freeze that stops the sim and fires onSettle when max per-node displacement stays below FREEZE_MOVE_EPSILON for FREEZE_DWELL_TICKS, with the dwell scaled as clamp(round(nodeCount/K),DWELL_MIN,DWELL_MAX), the dwell counter resetting on any node exceeding the epsilon, and the alpha-floor freeze kept as the hard backstop per D5; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `W01.P03.S12` - Make set-representation-mode a no-op when the requested mode equals the already-applied connectivity mode and the model is already laid out, so set-data is the single connectivity initializer on first load per D6; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W01.P03.S13` - Drop the instant seed-fit when an animated settle-fit will follow, retaining it only as a one-shot framing when there is no prior camera state and no settle is expected per D6; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W01.P03.S14` - Add a freeze/unfreeze toggle mapped to driver stop() and a low-alpha start(), emitting a scene command only, and keep collision/separation/damping knobs unexposed and cooling fixed per D7; `frontend/src/app/stage/GraphControls.tsx`.

### Phase `W01.P04` - live-loop verification

Drive the live onPositions loop in tests, the surface the prior cycle's 20 layout tests never exercised, and re-baseline the lowered reheat constants.

- [ ] `W01.P04.S15` - Add live-loop driver tests that drive the onPositions callback through real ticks and assert incremental reheat preserves survivor positions, the held alphaTarget keeps the field warm during interaction, and the velocity/dwell freeze stops the sim per D1/D2/D5; `frontend/src/scene/field/forceLayout.test.ts`.
- [ ] `W01.P04.S16` - Add PointerGestures tests covering node-hit-on-down versus empty-canvas-on-down, the still-a-select-below-threshold case, and a drag that starts on a node then moves onto empty canvas per D3; `frontend/src/scene/field/camera.test.ts`.
- [ ] `W01.P04.S17` - Re-baseline any existing layout test that asserts the prior warm reheat against the lowered INCREMENTAL_REHEAT_ALPHA and confirm the constants tuned against 12-, 50-, and 300-node slices in the live loop; `frontend/src/scene/field/fieldAssembly.test.ts`.

## Wave `W02` - graph-layout-catalog: radial, hierarchical, and community deterministic-seed modes

Scene-only extension of the representation catalog with three framework-free deterministic-seed layouts per graph-layout-catalog-adr D1-D12: radial (d3-hierarchy + salience-root policy), hierarchical (hand-rolled Sugiyama), and community (hand-rolled Louvain + two-level placement), a grouped layout picker, removal of the dead sigma dependency, and golden-position determinism tests. Independent of the engine waves. W02's hierarchical Sugiyama may share longest-path code with W03's lineage rebuild; that coordination is called out in Parallelization.

### Phase `W02.P05` - radial layout (d3-hierarchy)

Add a deterministic radial/tree mode adopting d3-hierarchy with the salience-max root policy, selected-node override, and per-component angular sectors (D1, D4, D5).

- [ ] `W02.P05.S18` - Add d3-hierarchy (ISC, zero runtime deps) to the frontend dependencies per D4; `frontend/package.json`.
- [ ] `W02.P05.S19` - Add radialLayout.ts that picks a root, derives a BFS spanning tree over the splitBackbone backbone adjacency, runs d3.hierarchy and d3.tree().size([2pi,R]), and converts polar to cartesian into a positions Map per D1/D4/D7; `frontend/src/scene/field/radialLayout.ts`.
- [ ] `W02.P05.S20` - Implement the radial root policy: salience-max default with degree-max tie-break, selected-node override, and per-component roots laid out in separate angular sectors with salience-then-id deterministic tie-breaking per D5; `frontend/src/scene/field/radialLayout.ts`.
- [ ] `W02.P05.S21` - Register radial as a RepresentationMode union member and a case in representationLayout returning the positions Map, dispatched as a deterministic seed per D1; `frontend/src/scene/field/representationLayout.ts`.

### Phase `W02.P06` - hierarchical (Sugiyama) layout

Add a hand-rolled heuristic Sugiyama mode distinct from lineage, forbidding the exponential strategies, feeding on the layout backbone (D2, D3, D6, D7).

- [ ] `W02.P06.S22` - Add hierarchicalLayout.ts reusing longest-path depth layering over the splitBackbone backbone, with deterministic back-edge cycle removal via the visiting guard, and decide and record whether the longest-path code is extracted into a shared helper or duplicated from lineageLayout per D2/D7 and the open question; `frontend/src/scene/field/hierarchicalLayout.ts`.
- [ ] `W02.P06.S23` - Insert dummy nodes on multi-layer-spanning edges and add an iterated barycenter/median crossing-reduction sweep with a bounded iteration count and convergence cutoff per D2 and the open question; `frontend/src/scene/field/hierarchicalLayout.ts`.
- [ ] `W02.P06.S24` - Add a simple intra-layer x-coordinate assignment using only near-linear heuristics, forbidding decrossOpt and coordSimplex/coordQuad-optimal strategies as a hard guard per D6; `frontend/src/scene/field/hierarchicalLayout.ts`.
- [ ] `W02.P06.S25` - Register hierarchical as a distinct RepresentationMode from lineage, preserving lineage's onSpine/dangling honesty semantics, with a case in representationLayout per D1/D3; `frontend/src/scene/field/representationLayout.ts`.

### Phase `W02.P07` - community (Louvain) layout

Add a hand-rolled framework-free Louvain mode with deterministic two-level seed placement; graphology is not re-adopted (D8, D9).

- [ ] `W02.P07.S26` - Add communityLayout.ts with a self-contained seeded Louvain (modularity-gain move loop plus community-aggregation recursion) over the splitBackbone backbone adjacency, deterministic by id-sort tie-breaking, not re-adopting graphology per D8; `frontend/src/scene/field/communityLayout.ts`.
- [ ] `W02.P07.S27` - Add the deterministic two-level seed placement: communities on a coarse outer circle, members packed locally via the circularArrange idiom, with a recorded policy on capping/merging very small communities and the outer-radius/inner-spacing geometry per D9 and the open question; `frontend/src/scene/field/communityLayout.ts`.
- [ ] `W02.P07.S28` - Register community as a RepresentationMode and case in representationLayout, and optionally drive the existing featureHulls overlay from community membership as an overlay never a re-layout per D9; `frontend/src/scene/field/representationLayout.ts`.

### Phase `W02.P08` - grouped picker chrome, dependency hygiene, determinism tests

Move GraphControls to a grouped layout picker, register the three modes un-gated, remove the dead sigma dependency, and add golden-position determinism tests (D10, D11, D12).

- [ ] `W02.P08.S29` - Refactor the LayoutGroup Segmented control into a grouped picker with a Spatial group (Network, Tree, Layered, Radial, Communities, and gated Grouped-by-meaning) and Timeline kept as the distinct temporal entry, reusing the available flag for any future gated entry per D11; `frontend/src/app/stage/GraphControls.tsx`.
- [ ] `W02.P08.S30` - Confirm the three new modes ship un-gated with no SEMANTIC_MODE_GATE-style downgrade and reconcile or retire the stale RepresentationModePanel reference named in the GraphControls header comment per D10/D11; `frontend/src/app/stage/GraphControls.tsx`.
- [ ] `W02.P08.S31` - Remove the dead sigma ^3.0.3 dependency, the abandoned render half of the retired graphology/ForceAtlas2 stack imported nowhere in src, per D12; `frontend/package.json`.
- [ ] `W02.P08.S32` - Add golden-position determinism tests per layout over a fixed bounded fixture asserting same inputs yield same positions, mirroring the existing layout tests per D5/D9 and the open question; `frontend/src/scene/field/representationLayout.test.ts`.

## Wave `W03` - graph-lineage-dag: Sugiyama lineage rebuild plus engine derivation-labeling completion

Rebuild the lineage mode as a full Sugiyama DAG layout and close the engine derivation-labeling hole that starves it, per graph-lineage-dag-adr D1-D8. Spans scene (Sugiyama pipeline, off-spine policy, routed waypoints, index suppression, aggregate-LOD) and engine (edge_view node.kind container-path labeling, /graph/lineage lineage_arc derivation). Engine additions are additive, read-and-infer, and non-id-bearing. Can run in parallel with the scene-only and frontend waves but needs its own review per the review-revision-precedence rule.

### Phase `W03.P09` - engine derivation-labeling completion

Widen edge_view's container-path detection to read node.kind, label Contains hierarchy edges, and wire /graph/lineage lineage_arc to derivation_label; all additive and non-id-bearing (D3, D4, D7).

- [ ] `W03.P09.S33` - Widen edge_view's is_exec_container_path predicate to also fire when the src node kind is NodeKind::PlanContainer and the dst stem is an exec record via stem_is_exec_record, not only the doc_type pair, keeping the closed derivation vocabulary pure per D3.1; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W03.P09.S34` - Label the plan-internal Contains hierarchy edges (plan-wave-phase-step) so the authored hierarchy is a connected lineage chain, deciding whether Contains rides generated-by or carries a distinct container sub-label and reconciling with DERIVATION_AXIS_ORDER per D3.2 and the open question; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W03.P09.S35` - Confirm and lock that the widened detection never threads derivation_label into edge_id, keeping the PlanContainer edge stable keys composed only from endpoint and child-container ids per D3.3; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `W03.P09.S36` - Replace the hardcoded derivation: None in lineage_arc with a call to ontology::derivation_label using the in-scope graph and endpoint nodes, and remove the stale comment per D4/D7; `engine/crates/engine-query/src/lineage.rs`.

### Phase `W03.P10` - Sugiyama lineage layout rebuild

Rebuild lineageLayout as a full deterministic Sugiyama pipeline: cycle removal, dummy-node layering, median crossing reduction, Brandes-Kopf coordinates (D1).

- [ ] `W03.P10.S37` - Add deterministic DFS back-edge reversal to a DAG before layering, restoring reversed edges to true direction only for routing/draw, replacing the silent visiting-guard drop per D1.1; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P10.S38` - Keep longest-path layer assignment and insert dummy nodes on every edge spanning more than one layer so every edge becomes a chain of unit-length segments per D1.2; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P10.S39` - Replace the lexical id-sort with median/barycenter up-down crossing-reduction sweeps over combined real and dummy layer orders, with a fixed sweep count per D1.3/D1.5; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P10.S40` - Adopt Brandes-Kopf median-alignment within-layer coordinate assignment, deriving LINEAGE_ROW_SPACING/LINEAGE_COL_SPACING from layer occupancy for a legible aspect ratio, with a simpler median-alignment fallback if Brandes-Kopf proves heavy on the bounded slice per D1.4 and the open question; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P10.S41` - Pick the canonical spine edge per exec and dedup so an exec reaching the spine via both its labeled container binding and its plan wikilink is not double-counted per the open question; `frontend/src/scene/field/lineageLayout.ts`.

### Phase `W03.P11` - off-spine policy, index suppression, routed edges, aggregate-LOD

Replace the dead holding lane with feature-adjacency/temporal/gutter precedence, suppress index nodes, fold dummy-node waypoints into the line-list topology, and add ceiling-gated exec aggregate-LOD (D2, D5, D6, D8).

- [ ] `W03.P11.S42` - Replace the dead single-x holding lane with the off-spine precedence feature-adjacency, then temporal-axis by created date, then a faded dedicated gutter, preserving onSpine:false per D2; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P11.S43` - Filter index nodes (authority_class manifest) out of the derivation DAG before layering, lineage-mode-scoped not connectivity, drawing an included index node only via the off-spine feature-adjacency path marked as a manifest per D5; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W03.P11.S44` - Extend the lineage layout return type to carry routed waypoints and the preserved onSpine/dangling/depth fields through representationLayout, replacing the current discard per D6; `frontend/src/scene/field/representationLayout.ts`.
- [ ] `W03.P11.S45` - Fold dummy-node polyline waypoints into the existing line-list writeSegment topology for routed lineage edges, leaving semantic/meta triangle-list ribbons untouched per D6; `frontend/src/scene/field/edgeMeshes.ts`.
- [ ] `W03.P11.S46` - Add ceiling-gated aggregate-LOD that collapses the exec column to per-plan super-nodes consuming the aggregate hint when the slice approaches MAX_GRAPH_NODES, with id-keyed object-constancy reconciliation on expand/collapse per D8 and the open question; `frontend/src/scene/field/lineageLayout.ts`.

### Phase `W03.P12` - lineage verification

Golden-position determinism with an added back-edge, the engine non-id-bearing labeling invariant, and the timeline derivation-label parity.

- [ ] `W03.P12.S47` - Add a golden-position determinism test asserting same inputs yield same positions across re-runs and with an added back-edge, fixing sweep count and id tie-breaks per D1.5 and the open question; `frontend/src/scene/field/lineageLayout.test.ts`.
- [ ] `W03.P12.S48` - Add an engine test confirming the PlanContainer-to-exec container path now resolves generated-by and that the derivation_label is not part of any edge stable key, extending the derivation_label_is_not_part_of_the_edge_stable_key coverage per D3.3; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W03.P12.S49` - Add an engine test asserting lineage_arc now serves the derivation label end-to-end for timeline parity per D4/D7; `engine/crates/engine-query/src/lineage.rs`.

## Wave `W04` - graph-semantic-embeddings: serve rag vectors on a bounded tiers-gated endpoint so the meaning constellation becomes real

Make the semantic mode real by serving rag's stored embedding vectors on a dedicated bounded endpoint, per graph-semantic-embeddings-adr D1-D10. Spans rag-client (Qdrant scroll-with-vectors read), engine (a bounded /graph/embeddings route with tiers and a generation stamp), stores (lazy per-generation fetch), scene (the gate re-spec), and the mock. The consumer chain (semanticLayout PCA projection) already ships; the work is the engine producer and bounded transport. The stores lazy-fetch consumes the W04 engine route, so its phases are internally ordered; the wave can run in parallel with the other waves but needs its own review.

### Phase `W04.P13` - rag-client Qdrant scroll-with-vectors read

Read stored 1024-dim float32 dense vectors from rag's Qdrant over loopback HTTP, mapping point ids to target_node_id, behind the rag-client crate (D1, D10).

- [ ] `W04.P13.S50` - Add a Qdrant scroll-with-vectors read in rag-client that POSTs to /collections/{c}/points/scroll and /points by id with with_vector=true against the storage_path port discovered the same service.json way, reading stored vectors at zero re-embed cost per D1; `engine/crates/rag-client/src/client.rs`.
- [ ] `W04.P13.S51` - Resolve the Qdrant scroll API shape (collection names, the rag point-id to target_node_id mapping confirming the stored payload carries the stem or source, batch size, and how a missing point renders as honest absence) per the open question, scoping to vault-document node embeddings only per D10; `engine/crates/rag-client/src/client.rs`.
- [ ] `W04.P13.S52` - Apply the MAX_RAG_BODY byte cap and a wall-clock deadline to the embedding read per the subprocess-calls-carry-cap-and-timeout HTTP-read analog, preserving the engine-builds-no-embeddings-ever invariant per D1 and the open question; `engine/crates/rag-client/src/lib.rs`.

### Phase `W04.P14` - bounded /graph/embeddings route

Add a dedicated bounded tiers-gated route serving float32 vectors keyed by scope and node-id set with a generation stamp, never inline on /graph/query (D2, D3, D4, D7, D8).

- [ ] `W04.P14.S53` - Add a dedicated GET /graph/embeddings route serving raw float32 JSON number[] vectors keyed by scope and the served node-id set, capped at MAX_GRAPH_NODES with the same bound_slice/truncated honesty, built through the shared envelope helper so success and rag-down error both carry tiers per D2/D3/D7; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `W04.P14.S54` - Reject the include_embeddings inline flag and the server-side PCA-to-K reduction for v1, keeping the engine read-and-infer and the hot /graph/query path untaxed per D2/D4; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W04.P14.S55` - Stamp the response with the graph generation it was read at (the same generation /graph/query echoes) so the client caches per generation, and confirm the embedding enters no node or edge stable key per D8; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W04.P14.S56` - Report the semantic tier as Unavailable with a degradation_reason in the envelope tiers when rag/Qdrant is down, returning no vectors so the stores layer reads availability from tiers truth per D7; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `W04.P15` - stores lazy per-generation fetch and gate re-spec

Fetch /graph/embeddings lazily on entering semantic mode, cache per generation, read availability from tiers, and re-spec the promotion gate to measure real served embeddings (D2, D6, D7, D8).

- [ ] `W04.P15.S57` - Add the engine.ts client transport for GET /graph/embeddings and an adapter that carries embedding through to the node shape, consistent with /graph/query's DOI node-set selection so the embedding set matches the served node set per D2 and the open question; `frontend/src/stores/server/engine.ts`.
- [ ] `W04.P15.S58` - Add a stores query that fetches /graph/embeddings lazily only on entering semantic mode and caches per generation, re-fetching on generation change (full re-fetch per generation for v1) per D2/D8; `frontend/src/stores/server/queries.ts`.
- [ ] `W04.P15.S59` - Mark semantic unavailable from the fresh error tiers truth (error tiers winning over a stale held-success block), never from a bare fetch rejection, so the scene draws the honest fallback ring per D7; `frontend/src/stores/server/queries.ts`.
- [ ] `W04.P15.S60` - Re-spec SEMANTIC_MODE_GATE so its separation and a new data-presence criterion run against a captured real served slice through the same adaptGraphSlice/sceneMapping path, retaining the synthetic buildGateSlice only for the projection-time budget, with a plan-time-calibrated real-data separation floor starting at 1.2 per D6 and the open question; `frontend/src/scene/field/semanticGate.ts`.

### Phase `W04.P16` - mock parity and captured-live-sample verification

Serve the /graph/embeddings shape byte-for-byte in the mock and feed a captured live sample through adaptGraphSlice/sceneMapping per the mock-mirrors-live-wire-shape discipline (D6).

- [ ] `W04.P16.S61` - Serve the /graph/embeddings shape byte-for-byte in the mock engine, including the generation stamp and the tiers block, replacing the synthetic-only corpus embedding seed per the mock-mirrors-live-wire-shape discipline and D6; `frontend/src/testing/fixtures/corpus.ts`.
- [ ] `W04.P16.S62` - Add a consumer test that feeds a captured live /graph/embeddings sample through adaptGraphSlice and sceneMapping and asserts the PCA projection separates real clusters and the gate cannot report shipped on an empty path per D6; `frontend/src/stores/server/liveAdapters.test.ts`.

## Wave `W05` - code-artifact-nodes: mint inferred code/symbol nodes so structural mentions bridge to navigable graph nodes

Close the navigational dead-end where resolved Path/Symbol mentions address a code: node id that is never minted, per code-artifact-nodes-adr D1-D7. Engine-ingest only: mint code: nodes for resolved/stale Path+Symbol mentions in index.rs Pass 2 with identity from CanonicalKey::CodeArtifact, document-granularity bounding under MAX_GRAPH_NODES, and the bridge_dead_end_repro inversion. Additive and non-id-bearing for existing edges. Independent of the scene and frontend waves; needs its own review.

### Phase `W05.P17` - mint code-artifact nodes in ingest Pass 2

Upsert code: nodes for resolved/stale Path and Symbol mentions beside the edge that addresses them, with first-class NodeKind::CodeArtifact identity and document-granularity bounding (D1, D2, D3, D5, D6).

- [x] `W05.P17.S63` - In the serial Pass 2 edge-ingest, upsert_node the code: target for each resolved Path/Symbol mention in Resolved or Stale state, minting no node for Broken mentions and leaving StepId bridging out of v1 scope, carrying the request scope's facet beside the edge that addresses it per D1/D5; `engine/crates/engine-graph/src/index.rs`.
- [x] `W05.P17.S64` - Mint the code node as a first-class NodeKind::CodeArtifact carrying doc_type code as its species handle, a per-scope Facet with Presence::Exists, and no lifecycle or status/tier per D2; `engine/crates/engine-graph/src/index.rs`.
- [x] `W05.P17.S65` - Derive the stable id from node_id(CanonicalKey::CodeArtifact{path,symbol}) taken from the resolver's resolved_target, resolution-state-free and byte-stable across re-index, recording whether the v1 symbol node is name-only code-hash-symbol (non-id-bearing, recommended) or path-anchored per D3 and the open question; `engine/crates/engine-graph/src/index.rs`.
- [x] `W05.P17.S66` - Confirm code nodes carry no feature_tags so the feature constellation projection excludes them, and that at document granularity they join the MAX_GRAPH_NODES-bounded pool with honest truncated reporting and the self-consistency edge retain, deriving identity independently of the rag chunk index per D4/D6; `engine/crates/engine-query/src/graph.rs`.

### Phase `W05.P18` - code-node verification and scale check

Invert the bridge dead-end reproduction, add a broken-target repro, and confirm the cold-index profile stays linear at corpus scale (D1, D7).

- [x] `W05.P18.S67` - Invert the bridge_dead_end_repro assertion from None-expected to a real code: id-expected for a resolved/stale mention, confirming /nodes/{id} no longer 404s with no change to bridge_node_id itself per D1/D7; `engine/crates/engine-query/tests/bridge_dead_end_repro.rs`.
- [x] `W05.P18.S68` - Add a broken-target reproduction asserting a Broken mention still carries a null bridge and mints no node, locking in the truthful-absence boundary from D1; `engine/crates/engine-query/tests/bridge_dead_end_repro.rs`.
- [x] `W05.P18.S69` - Run the engine scale_bench to confirm the added upserts leave the linear cold-index profile intact at corpus scale per D6 and the open question; `engine/tests/tests/scale_bench.rs`.

## Wave `W06` - git-diff-browser wiring: flip the served constants and wire the chrome to the shipped /ops/git route

Wire the git diff browser to the already-shipped and tested /ops/git engine route, per dashboard-git-diff-browser-adr and the missing-backend-inventory Feature B. Pure frontend: the engine route, client.opsGit transport, adaptGitOp adapter, and mock are all done and tested; only the chrome constants and selectors are stranded behind GIT_*_SERVED=false. Flip the constants, wire useGitFileDiff and the changed-files selectors, parse porcelain-v1/numstat/unified diff, render in ChangesOverview/DiffView, and retire the engine-blocked stubs. Independent of every other wave.

### Phase `W06.P19` - wire git diff selectors and render the browser

Flip the served constants, wire the selectors to client.opsGit, parse the git output formats, render in the chrome, and retire the engine-blocked stubs (Feature B).

- [ ] `W06.P19.S70` - Flip GIT_DIFF_CAPABILITY_SERVED and CHANGED_FILES_LIST_SERVED to true and refresh the stale queries.ts git comments that wrongly claim no /ops/git route exists per Feature B; `frontend/src/stores/server/queries.ts`.
- [ ] `W06.P19.S71` - Wire useGitFileDiff and the changed-files selectors to client.opsGit(status|numstat|diff) issuing real queries instead of returning engineBlocked with no network call per Feature B; `frontend/src/stores/server/queries.ts`.
- [ ] `W06.P19.S72` - Parse porcelain-v1 status, numstat add/remove tallies, and unified diff hunks from the adaptGitOp output into the status-grouped changed-files and hunk-by-hunk shapes the chrome consumes per Feature B and the git-diff-browser ADR; `frontend/src/stores/server/liveAdapters.ts`.
- [ ] `W06.P19.S73` - Render the status-grouped changed-files list and retire the capability-pending stub in ChangesOverview, keeping grayscale-safe status marks and the read-and-infer no-write discipline per the git-diff-browser ADR; `frontend/src/app/right/ChangesOverview.tsx`.
- [ ] `W06.P19.S74` - Render the bounded hunk-by-hunk diff with twin tabular line-number gutters, +/- glyphs and labels, high-contrast green/red overriding warmth, honest truncation, and retire the engine-blocked stub in DiffView per the git-diff-browser ADR; `frontend/src/app/right/DiffView.tsx`.

## Wave `W07` - backend cleanup: delete dead QueryCore and refresh stale deferred comments

Curate pass closing the missing-backend-inventory Cleanup section: delete or repurpose the dead QueryCore foundation scaffold, and refresh the stale deferred/not-yet comments that the inventory verified are actually done. No feature behavior changes; comment-debt and dead-code removal only. Independent of every other wave; lowest risk, runs last or in parallel.

### Phase `W07.P20` - delete dead QueryCore and refresh stale comments

Remove the dead QueryCore scaffold and update the stale deferred/not-yet comments the inventory flagged as done (Cleanup section).

- [ ] `W07.P20.S75` - Delete the dead QueryCore scaffold (status() returning engine-index-not-yet-implemented and validate_scope), referenced nowhere outside its own tests since the real /status lives in routes/stream.rs, or repurpose it as the documented shared query-core handle per the Cleanup section; `engine/crates/engine-query/src/lib.rs`.
- [ ] `W07.P20.S76` - Refresh the stale deferred-fast-follow as-of-lineage comment now that the BLOB-TRUE as-of branch is implemented per the Cleanup section; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [ ] `W07.P20.S77` - Refresh the stale deferred-S45-wiring comment now that onNodeClick is actually wired per the Cleanup section; `frontend/src/app/AppShell.tsx`.
- [ ] `W07.P20.S78` - Refresh the stale deferred-S45-wiring comment now that onNodeClick is actually wired per the Cleanup section; `frontend/src/app/timeline/Timeline.tsx`.
- [ ] `W07.P20.S79` - Refresh the stale placeholder-for-the-extraction-pipeline doc-comment on the Mention enum now that the enum is real and used, after verifying completeness versus the comment per the Cleanup section; `engine/crates/ingest-struct/src/lib.rs`.
- [ ] `W07.P20.S80` - Refresh the stale provisional comment on the Timestamp i64 alias now that the temporal tier is served, unless a richer time type is actually needed per the Cleanup section; `engine/crates/engine-model/src/lib.rs`.

## Description

This plan converges the graph-visualization-framework decision set into one L3 epic, one
Wave per feature, turning the node-graph instrument into a stable, customizable,
information-rich connected-graph viz and filling the missing backend features the inventory
sweep surfaced. Each Wave is grounded in a single authorizing ADR whose `## Decision` and
`## Decision ledger` map directly to its Steps; the missing-backend-inventory research
grounds the git-diff wiring (Feature B, W06) and the cleanup pass (W07).

`W01` (graph-force-stability-adr) is the scene-only stability and Obsidian-fidelity
follow-on to the d3-force connectivity driver: incremental-reheat routing, the
beginInteraction/endInteraction held-warmth seam, drag-to-pin, per-node collision,
velocity/dwell freeze, the mount-time double-init/double-fit collapse, and a freeze toggle.
`W02` (graph-layout-catalog-adr) grows the representation catalog with three framework-free
deterministic-seed modes (radial via d3-hierarchy, hand-rolled Sugiyama hierarchical,
hand-rolled Louvain community), a grouped layout picker on the live `GraphControls` chrome,
and removal of the dead `sigma` dependency. `W03` (graph-lineage-dag-adr) rebuilds the
lineage mode as a full Sugiyama DAG and closes the engine derivation-labeling hole that
starves it, spanning scene and engine with additive, read-and-infer, non-id-bearing engine
changes. `W04` (graph-semantic-embeddings-adr) makes the semantic meaning-constellation real
by serving rag's stored embedding vectors on a dedicated bounded tiers-gated
`/graph/embeddings` route, spanning rag-client, engine, stores, scene, and the mock. `W05`
(code-artifact-nodes-adr) mints inferred `code:` nodes in ingest so resolved Path/Symbol
mentions bridge to navigable graph nodes. `W06` (dashboard-git-diff-browser-adr, Feature B)
wires the git diff browser to the already-shipped and tested `/ops/git` route by flipping
the served constants and rendering the chrome. `W07` (Cleanup section) deletes the dead
`QueryCore` scaffold and refreshes the stale deferred/not-yet comments the inventory verified
are done.

All engine work honors the four standing graph rules: layout compute is CPU and the GPU only
renders, every graph read is bounded by default, the engine stays read-and-infer, and every
wire response carries the tiers block through the shared envelope. Scene work stays inside
`frontend/src/scene/`, chrome emits only `SceneController.command()` and reads `tiers` only
through the stores layer, and the stores layer remains the sole wire client.

## Steps







## Parallelization

The seven Waves are unusually decoupled because they touch disjoint surfaces, so the
default Wave sequencing is relaxed here: all seven can run concurrently, each behind its
own review gate. The dependency map is by surface, not by ordering.

W01 (scene driver/gestures/assembly + GraphControls), W02 (scene layout modules +
GraphControls), W06 (frontend git-diff chrome + stores), and W07 (engine/frontend
comment-and-dead-code cleanup) are largely independent of each other and of the engine.
The one within-W01/W02 contact point is `GraphControls.tsx`: W01.P01.S05 and W01.P03.S14
add the slider-coalesce and freeze toggle, while W02.P08.S29/S30 refactor the same control
into a grouped picker; if W01 and W02 run truly concurrently, the GraphControls edits must
be coordinated (sequence the two GraphControls phases, or land them in one chrome pass) to
avoid a merge collision on that file.

W03, W04, and W05 each touch the engine and can run in parallel with each other and with
the scene/frontend waves, but each carries its own review per the review-revision-precedence
rule (engine changes are reviewed independently). Their cross-wave dependencies:

- W04 carries the one real internal hard dependency: the stores lazy-fetch and gate re-spec
  (W04.P15) consume the W04 engine `/graph/embeddings` route (W04.P14), which in turn
  consumes the W04 rag-client Qdrant read (W04.P13). W04's phases are therefore internally
  ordered P13 then P14 then P15 then P16; the wave as a whole still parallelizes against the
  other waves.
- W02's hand-rolled hierarchical Sugiyama (W02.P06) and W03's lineage Sugiyama rebuild
  (W03.P10) both build a longest-path layering. The graph-layout-catalog ADR's open question
  asks whether the longest-path code is extracted from `lineageLayout` into a shared helper
  or duplicated; W02.P06.S22 records that decision. If extraction is chosen, W02.P06 and
  W03.P10 must coordinate on the shared helper (sequence them or assign one executor to the
  shared module); if duplication is chosen, they are independent. This is the only scene-side
  cross-wave coordination point.

Within each Wave, Phases are sequenced where a later Phase consumes an earlier Phase's
output (W04 as above; W03.P10 consumes the layered structure W03.P09's labels feed, and
W03.P11/P12 consume W03.P10) and may otherwise run in parallel.

## Verification

The gate for every Wave is a full lint gate at exit 0 per the declaring-green-runs-the-full-gate
rule: `just dev lint frontend` (eslint + prettier + tsc) for the scene/frontend waves and
`just dev lint all` for any wave that touches the engine; a partial run (eslint-only, or
`cargo clippy` without `cargo fmt --check`) is never green. Each Wave additionally satisfies
its per-wave tests and invariants, and each Wave is independently reviewed.

- W01 (force stability): the new live-loop driver tests pass (W01.P04.S15) driving the real
  onPositions loop, the PointerGestures node-hit/empty-canvas/below-threshold-select tests
  pass (W01.P04.S16), the lowered reheat constants are re-baselined (W01.P04.S17), idle CPU
  stays at zero, and the cooling-is-fixed and render-gated-on-the-layout-clock contracts hold
  (alphaTarget is an interaction floor, the velocity-freeze is a settle detector).
- W02 (layout catalog): golden-position determinism tests pass per layout over a fixed
  bounded fixture (W02.P08.S32), the exponential strategies (decrossOpt, coordSimplex/Quad)
  are guarded out not just avoided (D6), the modes ship un-gated, and `sigma` is gone with
  zero call-site impact.
- W03 (lineage DAG): the golden-position-with-added-back-edge determinism test passes
  (W03.P12.S47), the engine tests confirm the PlanContainer-to-exec container path resolves
  generated-by AND that derivation_label enters no edge stable key (W03.P12.S48,
  provenance-stable-keys-are-identity-bearing), and lineage_arc serves the derivation label
  end-to-end (W03.P12.S49). The engine changes are verified additive, read-and-infer, and
  bounded by MAX_GRAPH_NODES.
- W04 (semantic embeddings): the captured-live-sample consumer test passes through
  adaptGraphSlice/sceneMapping (W04.P16.S62), the mock serves the /graph/embeddings shape
  byte-for-byte (W04.P16.S61, mock-mirrors-live-wire-shape), the route is bounded with
  truncated honesty and carries the tiers block on success and rag-down error
  (every-wire-response-carries-the-tiers-block), semantic availability is read from tiers not
  from a transport error (degradation-is-read-from-tiers-not-guessed-from-errors), the engine
  reads vectors and never computes them or coordinates (engine-read-and-infer,
  published-wheel-purity: loopback HTTP only, no rag/torch import), and the generation stamp
  enters no stable key. The re-spec'd gate cannot report shipped on an empty path.
- W05 (code-artifact nodes): the bridge_dead_end_repro assertion inverts to a real code: id
  (W05.P18.S67), the new broken-target repro asserts a still-null bridge and no minted node
  (W05.P18.S68), scale_bench confirms the cold-index profile stays linear at corpus scale
  (W05.P18.S69), and the minted nodes are excluded from the constellation and bounded at
  document granularity (graph-queries-are-bounded-by-default).
- W06 (git-diff wiring): the served constants are flipped, useGitFileDiff and the
  changed-files selectors issue real client.opsGit queries, the porcelain-v1/numstat/unified
  diff parse renders in ChangesOverview/DiffView with grayscale-safe status marks and
  green/red overriding warmth, no write-shaped affordance appears (read-and-infer), and the
  existing /ops/git adapter/mock tests stay green.
- W07 (cleanup): the dead QueryCore is removed or repurposed with no remaining references
  outside its own tests, the stale comments are refreshed, and the full gate stays green with
  no behavior change.

The plan is complete when every Step is closed (`- [x]`) and every Wave has passed its
independent review with the full lint gate green.
