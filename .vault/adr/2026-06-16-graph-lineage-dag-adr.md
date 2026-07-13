---
tags:
  - '#adr'
  - '#graph-lineage-dag'
date: '2026-06-16'
modified: '2026-07-13'
related:
  - "[[2026-06-16-graph-lineage-dag-research]]"
  - "[[2026-06-14-graph-node-semantics-adr]]"
  - "[[2026-06-14-graph-representation-adr]]"
---

# `graph-lineage-dag` adr: `rebuilding the lineage mode as a Sugiyama-layered DAG and closing the engine derivation-labeling hole that starves it` | (**status:** `accepted`)

## Context

The lineage representation mode (`graph-representation` ADR, the `adopt-v1` lineage derivation-DAG layout) is supposed to draw the pipeline DAG (`research → adr → plan → exec → audit → rule`) along a left-to-right derivation axis, the CitNetExplorer / W3C PROV convention named in the module header (`frontend/src/scene/field/lineageLayout.ts:3-8`). In the running app it reads as a near-vertical stack, not a layered DAG. The research (`[[2026-06-16-graph-lineage-dag-research]]`) isolates two independent root causes that compound.

**The layout is not a DAG layout.** `lineageLayout` assigns every on-spine node `x = depth * LINEAGE_COL_SPACING` and `y = i * LINEAGE_ROW_SPACING - offset`, where `i` is the index after a plain `[...ids].sort()` (`lineageLayout.ts:131-143`). There is no crossing reduction (the order is lexical id-sort, not barycenter/median over neighbor positions), no dummy nodes for edges spanning non-adjacent layers, and no edge routing — `representationLayout` keeps only `{x,y}` per node and discards the `depth/onSpine/dangling` honesty fields (`representationLayout.ts:57-63`), and the edge mesh draws straight center-to-center `writeSegment` segments (`edgeMeshes.ts:470,494-500`). The derivation axis has only six rungs (`DERIVATION_AXIS_ORDER`, `edgeMeshes.ts:85-93`), and over the live corpus (24 research / 44 adr / 31 plan / **642 exec** / 17 audit / 4 reference / 46 index) the overwhelming majority of on-spine nodes are exec records, all landing in the single `generated-by` column. That column becomes a ~600-tall id-sorted vertical stack at one `x`: an aspect ratio of ~170:1 against the horizontal spread — visually a vertical line. The off-spine holding lane (`lineageLayout.ts:48-49,144-154`) is a second dead vertical stack at one `x`.

**The engine derivation labeling that feeds the layout has a structural hole.** `derivation_label` (`ontology.rs:74-120`) keys primarily off the endpoint `doc_type` pair. The corpus links densely across types via `related:` wikilinks (every exec record carries one wikilink to its plan), so cross-type pipeline edges *do* get labeled and exec records *do* reach the spine. But the engine's own most reliable derivation signal — the authored plan→step→exec hierarchy carried by the `PlanContainer → exec` binding edges and the `Contains` hierarchy edges — is unlabeled. `PlanContainer` nodes have `doc_type: None` (`index.rs:717`), so `bind_steps_to_exec_records`' `References` edge (`index.rs:907`) and the `Contains` edges (`index.rs:835`) match `(None, ...)` arms that resolve to `None` (`ontology.rs:115-118`). The `is_exec_container_path` gate in `edge_view` requires both endpoints be `plan`/`exec` doc-types (`graph.rs:137-139`), so it never fires on the `PlanContainer` src path the id-encoding actually flows through. The semantics ADR explicitly named "`generated-by` read from the record id's `W##/P##/S##` container path" as "the most reliable edge in the corpus," but the shipped code reads that signal only on the doc→doc wikilink path. Separately, `/graph/lineage` hardcodes `derivation: None` (`lineage.rs:208-220`) with a stale comment — false since `edge_view` already serves the label end-to-end.

This ADR settles the layout rebuild as a full Sugiyama pipeline and closes the engine labeling hole. It extends — never replaces — the `[[2026-06-14-graph-node-semantics-adr]]` derivation vocabulary; all engine additions are additive, read-and-infer, and non-id-bearing. The layout is pure CPU scene compute over served data (`graph-compute-is-cpu-gpu-is-render-and-search`, `dashboard-layer-ownership`).

## Decision

### D1 — Rebuild `lineageLayout` as a full Sugiyama pipeline for v1

- **D1.1 Cycle removal.** Reverse back-edges into a DAG before layering (deterministic DFS), rather than merely breaking them with the `visiting` guard (`lineageLayout.ts:88`), which silently drops a back-edge's contribution; reversed edges are restored to true direction only for routing/draw.
- **D1.2 Layer assignment with dummy nodes.** Keep longest-path layering (the existing `depthOf`), and **insert dummy nodes** on every edge spanning more than one layer so every edge becomes a chain of unit-length segments — the prerequisite for D6.
- **D1.3 Crossing reduction by median/barycenter.** Replace the lexical `[...ids].sort()` (`lineageLayout.ts:132`) with median/barycenter up-down sweeps over the combined real+dummy layer orders — the single most impactful missing piece; it spreads the over-stacked `generated-by` column by neighbor position.
- **D1.4 Coordinate assignment.** Adopt Brandes-Köpf (linear-time median alignment) for within-layer coordinates; `LINEAGE_ROW_SPACING`/`LINEAGE_COL_SPACING` become derived from layer occupancy so the aspect ratio is legible (170:1 is the proximate "vertical" cause).
- **D1.5 Determinism.** Same inputs → same positions (the module's standing promise, `lineageLayout.ts:51-52`): fixed sweep count, all tie-breaks by node id, id-sorted DFS order. The `onSpine`/`dangling` honesty fields are preserved and now flow through to the scene (D6).

*Rationale:* Sugiyama is the standard layered-DAG framework; worst-case `O((|V|+|E|) log|E|)`, well within the CPU-worker budget for a bounded slice. Determinism is required for mental-map preservation. *Verdict: adopt-v1.*

### D2 — Off-spine placement policy: feature-adjacency, then temporal, then gutter

The dead single-`x` holding lane is replaced with this precedence: (1) **feature-adjacency** — an off-spine node bearing a feature tag is placed adjacent to its feature column (the orthogonal feature-membership edge family the semantics ADR names); (2) **temporal-axis** — a node with no feature anchor but a `created` date takes a temporal-axis `x` (CitNetExplorer chronological convention); (3) **gutter** — only a node with neither goes to a small dedicated gutter, drawn faded with `onSpine: false` preserved. *Rationale:* both reference conventions prefer an informative position to a dead lane; feature-adjacency ties to real structure, temporal is the dated fallback, the gutter is the honest last resort. *Verdict: adopt-v1.*

### D3 — Close the engine labeling hole by reading `node.kind`, not only `doc_type`; seam is `edge_view`

- **D3.1 Seam = `graph.rs::edge_view`, not `ontology.rs::derivation_label`.** Extend `edge_view`'s `is_exec_container_path` predicate (`graph.rs:137-143`) to also fire when the src node `kind` is `NodeKind::PlanContainer` and the dst is an exec-record document (read `node.kind` and the dst stem via `stem_is_exec_record`, not only the `doc_type` pair). `derivation_label`'s `is_exec_container_path` branch already returns `generated-by` for that flag; only the *caller's detection* widens, keeping the closed vocabulary pure.
- **D3.2 `Contains` hierarchy labeling.** The plan-internal `Contains` edges (plan→wave→phase→step) are labeled with the container relation so the authored hierarchy is a connected lineage chain rather than dropping off-spine; whether it carries a distinct sub-label or rides `generated-by` is settled in the plan, but it is labeled, not `None`.
- **D3.3 Additive and non-id-bearing — confirmed.** `derivation_label` is never threaded into `edge_id` (`ontology.rs:66-68`; the `derivation_label_is_not_part_of_the_edge_stable_key` test); the `PlanContainer` edges' stable keys are composed only from endpoint ids and the child container id. Widening *detection* changes the served label only, never an id.

*Rationale:* the central spec-vs-shipped gap; reading `node.kind` lets the authored hierarchy become the spine it was always meant to be. *Verdict: adopt-v1.*

### D4 — Wire `/graph/lineage` `lineage_arc` to `derivation_label` (timeline parity)

`lineage_arc` (`lineage.rs:208-220`) calls `ontology::derivation_label` exactly as `edge_view` does, replacing the hardcoded `derivation: None`. The `lineage()` projection already has the graph and endpoint nodes in scope. The frontend adapter is already tolerant (`liveAdapters.ts:206-234`), so this is a pure backend completion; the stale comment is removed. *Verdict: adopt-v1.*

### D5 — Index-node policy: suppress index nodes from the lineage spine (manifests, not lineage members)

Index nodes (46, `authority_class = manifest`, generated) are filtered out of the derivation DAG before layering — not given a new `indexes`/`manifest` label and not placed in the spine. An included index node is drawn only via the D2 off-spine feature-adjacency path, marked as a manifest. *Rationale:* an index is a generated manifest, not a derivation step; labeling index→member edges would inject 46 fan-out hubs that distort layering for no provenance value. Index nodes remain first-class in connectivity mode. *Verdict: adopt-v1.*

### D6 — Edge routing: fold dummy-node waypoints into the existing line-list topology

The Sugiyama dummy-node waypoints (D1.2) are drawn by folding polyline waypoints into the existing `line-list` topology in `EdgeMeshLayer` (`edgeMeshes.ts:499-500`), not a new mesh topology: a routed lineage edge becomes a chain of `writeSegment` segments through its dummy-node waypoints. The lineage layout's return type is extended so `representationLayout` carries routed waypoints (and the preserved `onSpine`/`dangling`/`depth` fields) to the edge layer, replacing the current discard at `representationLayout.ts:57-63`. Semantic/meta edges keep their `triangle-list` ribbon topology untouched. *Verdict: adopt-v1.*

### D7 — `/graph/lineage` and `/graph/query` lineage share one derivation projection, stay distinct surfaces

Both consume the **one** `ontology::derivation_label` projection (the shared seam D3/D4 complete), but they remain **distinct surfaces**: `/graph/query` serves the topological derivation slice the Sugiyama layout lays out; `/graph/lineage` serves the diachronic date-ranged timeline arc projection with its `LineageTiers` present-only-semantic block. They share the label vocabulary, not the slice shape. *Rationale:* two projections over one `LinkageGraph` (`views-are-projections-of-one-model`), not a merged endpoint. *Verdict: adopt-v1.*

### D8 — Aggregate-LOD for the exec column: adopt, gated on the node ceiling

The exec column collapses to **per-plan super-nodes** ("N records, M complete") when the served lineage slice approaches `MAX_GRAPH_NODES` (5000, `graph.rs:51`), consuming the existing `aggregate` hint (`is_aggregate_species`, `ontology.rs:42-44`; exec is the only aggregate species). Below the threshold exec records lay out individually. The collapse is a CPU-worker LOD over a bounded slice — no new endpoint, no engine coordinate. *Rationale:* the exec long tail (642 of ~808 on-spine nodes) is exactly the column that produces the vertical stack; the aggregate hint exists precisely so the tail collapses. Ceiling-gating keeps small corpora fully detailed. *Verdict: adopt-v1 (ceiling-gated).*

## Decision ledger

| # | Decision | Verdict | Layer |
|---|---|---|---|
| D1 | Full Sugiyama pipeline (cycle-removal, dummy-node layering, median crossing reduction, Brandes-Köpf coords, deterministic) | adopt-v1 | scene |
| D2 | Off-spine placement: feature-adjacency → temporal → gutter | adopt-v1 | scene |
| D3 | Close labeling hole by reading `node.kind` in `edge_view`'s container-path gate; additive, non-id-bearing | adopt-v1 | engine |
| D4 | Wire `/graph/lineage` `lineage_arc` → `derivation_label` | adopt-v1 | engine |
| D5 | Suppress index nodes from the lineage spine | adopt-v1 | scene + engine projection |
| D6 | Fold dummy-node waypoints into the existing `line-list` topology | adopt-v1 | scene |
| D7 | One shared `derivation_label` projection; surfaces stay distinct | adopt-v1 | engine |
| D8 | Aggregate-LOD: collapse the exec column to per-plan super-nodes at the ceiling | adopt-v1 (ceiling-gated) | scene |

## Consequences

**Gains.** The lineage mode finally reads as a layered DAG: the over-stacked exec column is spread, long edges route through waypoints, and the structure the layout exists to show becomes visible. Closing the labeling hole (D3) makes the authored plan→step→exec hierarchy a first-class spine; the timeline gains the same label (D4). The off-spine policy (D2) and index suppression (D5) keep the spine clean and honest. Aggregate-LOD (D8) makes the 642-exec worst case legible while small corpora stay detailed. Every engine change is additive, re-computable, non-id-bearing.

**Costs.** Full Sugiyama is materially more code — five phases, dummy-node bookkeeping, deterministic tie-breaking, routed-waypoint plumbing through `representationLayout` into the edge layer. The layout return shape grows (waypoints + preserved fields). Aggregate-LOD adds a second exec representation the renderer must reconcile with object constancy on zoom.

**Risks.** A non-deterministic sweep would break mental-map stability; D1.5 fixes sweep count and tie-breaks by id. Reading `node.kind` must stay strictly a detection widening — if it ever fed an id it would re-key edges (D3.3 confirms it never enters `edge_id`). Index suppression (D5) must be lineage-mode-scoped, not connectivity.

## Alternatives considered

- **Incremental tuning instead of Sugiyama.** Rejected: without dummy nodes long edges still cut straight through layers, and spacing tweaks cannot fix a 600-node single column — it needs barycenter *and* coordinate assignment.
- **Label the hole in `ontology.rs` by adding `PlanContainer` doc-type arms.** Rejected: `PlanContainer` nodes have `doc_type: None`; threading `node.kind` into `ontology.rs` would duplicate the graph-aware endpoint inspection `edge_view` already owns. Widen `edge_view`'s predicate (D3.1).
- **A new `indexes`/`manifest` derivation label.** Rejected (D5): injects 46 fan-out hubs that distort layering for no provenance value.
- **A new polyline mesh topology for routed edges.** Rejected (D6): dummy-node chains are already straight-segment sequences the `line-list` path draws.
- **Defer aggregate-LOD.** Rejected (D8): the exec column *is* the vertical-stack defect; the aggregate hint already exists to solve it.
- **Merge `/graph/lineage` into `/graph/query`.** Rejected (D7): different questions, different envelopes; sharing the projection ends the divergence without collapsing two distinct surfaces.

## Constraints & rule compliance

- **`graph-compute-is-cpu-gpu-is-render-and-search`.** The whole Sugiyama pipeline, off-spine policy, routing, and aggregate-LOD run on the CPU worker over engine-served nodes; the GPU draws the line segments and sprites; the engine holds no coordinates.
- **`engine-read-and-infer`.** The labeling additions (D3, D4) are pure re-computable projections over what the engine already reads; nothing is written to `.vault/`, no git ref mutated, no sibling semantics enter the engine.
- **`provenance-stable-keys-are-identity-bearing`.** The derivation label is never part of any edge stable key (D3.3); widening detection changes the served label only, never an id — no re-key, no contract event.
- **`dashboard-layer-ownership` / `views-are-projections-of-one-model`.** The layout is a scene projection over data delivered by stores via `SceneController`; both lineage surfaces are projections over the one `LinkageGraph` (D7).
- **`every-wire-response-carries-the-tiers-block`.** No new front door; the label rides the existing `edge_view`/`lineage_arc` shapes inside already-enveloped responses.
- **`graph-queries-are-bounded-by-default`.** The lineage slice stays bounded by `MAX_GRAPH_NODES`; aggregate-LOD (D8) is a client-side LOD over a bounded slice.

## Open questions deferred to the plan

- `Contains` sub-label (D3.2): does the hierarchy ride `generated-by` or carry a distinct container sub-label? Reconcile with `DERIVATION_AXIS_ORDER` (`edgeMeshes.ts:85-93`).
- Container vs doc edge canonicality: with the container→exec binding now labeled, does the layout double-count an exec node that also reaches the spine via its plan wikilink? The plan picks the canonical spine edge per exec and dedups.
- `DERIVATION_AXIS_ORDER` reconciliation: the constant includes `binds`/`aggregates`, but the engine emits `authorizes` (not `binds`) and `aggregates` only for exec→summary.
- Aggregate-LOD threshold and object constancy (D8): exact node-count trigger and id-keyed reconciliation on expand/collapse.
- Brandes-Köpf vs simpler median alignment (D1.4): if Brandes-Köpf proves heavy for the bounded slice, a simpler median-alignment pass is the fallback; measure.
- Determinism test fixture (D1.5): golden-position assertion across re-runs and an added back-edge.

## Sources

- `[[2026-06-16-graph-lineage-dag-research]]` — the 170:1 vertical-stack root cause, the derivation-label coverage hole, the Sugiyama reference, the open questions, the 2026-06-16 corpus measurement.
- `[[2026-06-14-graph-node-semantics-adr]]` — the typed derivation vocabulary this extends; "`generated-by` from the id container path, most reliable edge"; PROV convention; additive/non-id-bearing labeling.
- `[[2026-06-14-graph-representation-adr]]` — the `adopt-v1` lineage derivation-DAG mode, CitNetExplorer/PROV, CPU-worker layout, mental-map stability.
- Code: `frontend/src/scene/field/lineageLayout.ts:24-49,85-105,131-154`; `edgeMeshes.ts:85-100,470,494-500`; `representationLayout.ts:51-83`; `engine/crates/engine-query/src/ontology.rs:42-58,74-120,127-146`; `graph.rs:51,93-156`; `lineage.rs:77-93,185-220`; `engine-graph/src/index.rs:700-814,822-849,860-928`.
- Sugiyama method, Brandes-Köpf coordinate assignment, median/barycenter crossing reduction (Healy, *Hierarchical Drawing Algorithms*); CitNetExplorer (arXiv 1404.5322); W3C PROV.
- Rules: `graph-compute-is-cpu-gpu-is-render-and-search`, `engine-read-and-infer`, `provenance-stable-keys-are-identity-bearing`, `dashboard-layer-ownership`, `views-are-projections-of-one-model`, `every-wire-response-carries-the-tiers-block`, `graph-queries-are-bounded-by-default`.
