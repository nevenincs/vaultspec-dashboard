---
tags:
  - '#research'
  - '#graph-lineage-dag'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# Lineage DAG rebuild research

## Problem & why it reads as linear (evidence)

The lineage representation mode is supposed to lay the derivation DAG (`research → adr → plan → exec → audit → rule`) along a left-to-right derivation axis (the CitNetExplorer / W3C PROV convention named in the module header, `frontend/src/scene/field/lineageLayout.ts:3-8`). In the running app it reads as a confusing near-vertical stack. Three independent causes compound:

**1. Only ~6 depth columns exist, and within each the nodes are stacked vertically by id-sort.** `lineageLayout` assigns every on-spine node an `x` of `depth * LINEAGE_COL_SPACING` and a `y` of `i * LINEAGE_ROW_SPACING - offset` where `i` is the index after a plain `[...ids].sort()` (`lineageLayout.ts:131-143`). The derivation axis has only six rungs (`DERIVATION_AXIS_ORDER` is `grounds=0 … promoted-from=5`, `edgeMeshes.ts:101-109`). Over the live corpus (24 research, 44 adr, 31 plan, **642 exec**, 17 audit, 4 reference, 46 index ≈ 808 nodes) the overwhelming majority of nodes that *do* reach the spine are exec records, which all land in the **same `generated-by` column (depth 2-3)**. That single column becomes a ~600-tall vertical id-sorted stack at one `x` — a vertical line, not a layered DAG. With `LINEAGE_ROW_SPACING = 60` that column is ~38,000 world units tall against `LINEAGE_COL_SPACING = 220` of horizontal spread: aspect ratio ~170:1, i.e. visually a vertical line.

**2. There is no crossing reduction and no edge routing.** Vertical order within a column is `sort()` by id (lexical), not barycenter/median over neighbor positions (`lineageLayout.ts:132`). Edges between adjacent columns cross arbitrarily, and long edges spanning non-adjacent depths are drawn as a single straight segment through the intervening columns with no dummy-node routing. The edge meshes draw straight `writeSegment` lines between node centers (`edgeMeshes.ts:493`); the lineage layout passes no routed waypoints, so the DAG's structure is invisible under edge clutter.

**3. The holding lane is a second dead vertical stack.** Off-spine nodes (no classified derivation edge) are all placed at a single `x = LINEAGE_HOLDING_X = -220` and stacked vertically by id-sort (`lineageLayout.ts:48-49, 144-154`). Whatever falls off-spine becomes a *second* vertical line beside the spine.

## Derivation-label coverage analysis (engine `ontology.rs`; how many edges get a label)

`derivation_label` (`engine/crates/engine-query/src/ontology.rs:74-120`) assigns a label from `(relation, src_type, dst_type, provenance, is_exec_container_path)`. Coverage is better than feared for cross-type pipeline links but has a sharp structural hole:

**What gets labeled (on-spine):** The label keys primarily off the endpoint `doc_type` pair (`ontology.rs:95-111`). The live corpus links densely across types via `related:` wikilinks → doc→doc `Mentions` structural edges (`index.rs:966,986`):
- research↔adr → `grounds`; plan↔adr → `authorizes`; audit↔{plan,exec} → `reviews`; rule↔audit → `promoted-from`.
- plan↔exec / exec↔plan → `generated-by`. **All 642 exec records carry exactly one `related:` wikilink — to their plan.** That `exec→plan` doc edge matches the `(Some("exec"), Some("plan"))` arm AND triggers `is_exec_container_path` (`graph.rs:137-143`, `ontology.rs:127-139`). So exec docs *do* reach the spine — into the one over-stacked column.

**What gets `None` (falls to the holding lane):**
- **The `Contains` plan-hierarchy edges and the `PlanContainer → exec` binding edges.** `bind_steps_to_exec_records` mints `PlanContainer → exec-doc` `References` edges (`index.rs:907`), and `PlanContainer` nodes have `doc_type: None` (`index.rs:717`). `(None, Some("exec"))` matches no arm and the relation fallback only catches `Reviews` (`ontology.rs:115-118`) → `None`. The container hierarchy (`Contains`, `index.rs:835`) is likewise `None`. The ADR explicitly calls the `generated-by` plan→exec edge "the most reliable edge in the corpus … read directly from the record id's `W##/P##/S##` container path" — but the shipped code reads that signal only on the *doc→doc* path, never on the structural *container→exec* path the id-encoding actually flows through. **This is the central spec-vs-shipped gap.**
- **Index nodes (46, generated).** `(index, *)` matches no arm → `None`; all 46 go to the holding lane.
- **Same-type and unnamed cross-reference `mentions` edges** → `None`.
- **Temporal/semantic-tier edges** are deliberately `None` (`ontology.rs:89-92`) — correct, they are not derivation.

**Net:** exec docs DO reach the spine via their plan wikilink, so the holding lane is not catastrophically large (mostly the 46 index nodes plus genuine orphans). The dominant defect is therefore **layout**, not coverage — but the coverage hole (container/binding edges unlabeled, the corpus's most structural signal) means the lineage is built on the weakest of the available edges and loses the authored plan→step→exec hierarchy entirely.

## Current lineage layout shortcomings (file:line)

- `lineageLayout.ts:131-143` — vertical order is `[...ids].sort()` (lexical id), no crossing reduction; one tall column per depth.
- `lineageLayout.ts:48-49, 144-154` — single-`x` holding lane, a second dead vertical stack.
- `lineageLayout.ts:74-80` — depth is longest-path over only the 6 axis rungs; no dummy/virtual nodes for long edges.
- `lineageLayout.ts:45-47` — `LINEAGE_COL_SPACING=220` vs `LINEAGE_ROW_SPACING=60`: with a ~600-node column the y-extent dwarfs x → reads vertical.
- `edgeMeshes.ts:112-116` (`isLineageEdge`) — an edge is a lineage edge ONLY if `edge.derivation` is one of the 6 axis labels; every `None`-labeled edge is invisible to the layout.
- `edgeMeshes.ts:101-109` — `DERIVATION_AXIS_ORDER` includes `binds`/`aggregates`, but the engine emits `authorizes` (not `binds`) and `aggregates` only for exec→exec summary pairs; reconcile.
- No edge routing: the lineage layout returns only `{x,y}` per node; edge meshes draw straight center-to-center segments.

## Backend gaps (graph-query vs `lineage.rs` None; what derivation completeness needs)

**Two separate backend surfaces serve (or fail to serve) `derivation`:**

1. **graph-query (`/graph/query`) — DOES serve it.** `edge_view` sets `view["derivation"]` from `derivation_label` (`graph.rs:130-156`), carried through `adaptGraphSlice` (`liveAdapters.ts:135-155`), into `SceneEdgeData.derivation` (`sceneMapping.ts:44-47`), consumed by `isLineageEdge`/`lineageLayout`. **Wired end-to-end** — the only defect is the label coverage hole.

2. **timeline lineage (`/graph/lineage`) — HARDCODES `None`.** `lineage_arc` sets `derivation: None` with the comment "no `derivation` field shipped on `Edge` yet" (`engine/crates/engine-query/src/lineage.rs:208-220`). Stale: the projection exists in `ontology.rs` and graph-query already serves it. The fix: wire the same `ontology::derivation_label(...)` call into `lineage_arc` (it needs the graph + endpoint doc-types, which `lineage()` already has in scope). The frontend adapter is already tolerant (`liveAdapters.ts:206-234`).

**What derivation completeness needs (the coverage fix):**
- Label the `PlanContainer → exec-doc` binding edge and the plan-hierarchy `Contains` edges as `generated-by` / the container relation, by teaching `derivation_label` (or `edge_view`) to recognize a `PlanContainer` endpoint as plan-derived. The `is_exec_container_path` test in `graph.rs:137-143` currently requires both endpoints be `plan`/`exec` doc-types; it should also fire when the src is a `PlanContainer` node and the dst is an exec record (read the kind, not just `doc_type`).
- Decide whether index→member edges deserve a label (a new `indexes`/`manifest` label, or keep `None` and handle index nodes as a node *class* in the layout).
- Additive and not id-bearing (`ontology.rs:66-68`) — labeling never re-keys an edge.

## Sugiyama / layered-DAG reference model

The standard framework for drawing a layered DAG is the **Sugiyama method**, five phases: (1) **cycle removal** (the existing `visiting` guard at `lineageLayout.ts:88` only breaks back-edges, it does not reverse them); (2) **layer assignment** (longest-path = what `depthOf` approximates, `lineageLayout.ts:85-105`), **crucially splitting edges spanning non-adjacent layers with *dummy nodes*** so every edge becomes a chain of unit-length segments — this makes long edges routable; (3) **crossing reduction** via **barycenter/median** sweeps (the single most impactful missing piece — replaces the lexical `sort()`); (4) **coordinate assignment** via **Brandes-Köpf** (linear-time, aligns nodes with median neighbors, straightens long edges); (5) **edge routing** through dummy-node waypoints. Worst-case `O((|V|+|E|) log|E|)`, `O(|V|+|E|)` space — well within the CPU-worker budget for a bounded slice (`graph-compute-is-cpu`; the engine holds no coordinates).

**Off-spine / direction conventions (CitNetExplorer, W3C PROV):** map *derivation-order → axis position*, *type → shape*, *derivation direction → edge direction*. Two reference ideas for off-spine nodes instead of a dead holding lane: (a) place a dated node at its **temporal-axis position** (CitNetExplorer's chronological axis); (b) attach a node to the spine via its **feature-membership star** (the orthogonal edge family the ADR names) — an index/orphan sits beside the feature column it belongs to, not a generic gutter.

## Recommended approach (layout rebuild + backend derivation completeness)

**A. Layout rebuild (scene, `lineageLayout.ts`) as a proper Sugiyama pipeline:**
1. Build the derivation DAG from labeled edges (keep `isLineageEdge` as the filter).
2. Layer assignment by longest path (reuse `depthOf`), **inserting dummy nodes** on every edge spanning >1 layer.
3. **Crossing reduction** via barycenter/median up-down sweeps over the (real + dummy) layer orders — replace `sort()`.
4. **Coordinate assignment** (Brandes-Köpf or median-alignment) so the dominant exec column is *spread*, not stacked. Tune spacing so the aspect ratio is legible (170:1 is the proximate "vertical" cause).
5. **Return routed edge waypoints** and have the edge mesh draw polylines through them.
6. **Replace the holding lane** with an informative placement: dated off-spine nodes take a temporal-axis x; feature-bearing ones sit adjacent to their feature column; only true orphans go to a small gutter. Preserve the `dangling`/`onSpine` honesty flags (`lineageLayout.ts:24-42`).

**B. Backend derivation completeness (engine):**
1. **Fix the container/binding coverage hole** so the authored plan→step→exec hierarchy is labeled `generated-by`: extend `is_exec_container_path`/`derivation_label` to recognize a `PlanContainer` src endpoint (read `node.kind`, not just `doc_type`).
2. **Wire `/graph/lineage` derivation** (`lineage.rs:208-220`): call `ontology::derivation_label` in `lineage_arc` exactly as `edge_view` does.
3. Decide the index-node policy. Keep all additions additive and id-neutral.
4. Reconcile `DERIVATION_AXIS_ORDER` (`edgeMeshes.ts:101-109`) with the labels the engine actually emits.

Both halves honor the layer-ownership rule: the layout is pure CPU scene compute over served data (`dashboard-layer-ownership`, `graph-compute-is-cpu`), and the derivation labels are a read-and-infer engine projection that never writes back or re-keys (`engine-read-and-infer`, `provenance-stable-keys-are-identity-bearing`).

## Open questions for the ADR

1. **Container vs doc derivation:** should `generated-by` ride the `PlanContainer → exec` binding edge instead of/in addition to the `exec-doc → plan-doc` wikilink? If both, does the layout double-count exec nodes? Which edge is canonical for the spine?
2. **Index nodes (46):** part of the lineage DAG, or suppressed in lineage mode (they are manifests, `authority_class = manifest`)?
3. **Off-spine placement policy:** temporal-axis, feature-adjacency, or gutter — which precedence?
4. **Crossing-reduction determinism:** barycenter sweeps must remain deterministic (module promises "same inputs → same positions"); fix sweep count, tie-break by id.
5. **Scale:** at `MAX_GRAPH_NODES = 5000` (`graph.rs:51`), is full Sugiyama within the layout-time budget, or does lineage need an aggregate LOD (collapse the exec column into per-plan "N records" super-nodes)?
6. **Edge routing in the mesh layer:** does `EdgeMeshLayer` need a new polyline topology, or can dummy-node waypoints fold into the existing line-list path?
7. **`/graph/lineage` vs `/graph/query` lineage:** two surfaces now both carry derivation — share one projection, or stay distinct (diachronic vs topological)?

## References

- `frontend/src/scene/field/lineageLayout.ts:45-49,74-105,131-154`; `edgeMeshes.ts:101-116,493`; `representationLayout.ts:51-83`; `sceneMapping.ts:44-47`; `sceneController.ts:123-131`.
- `engine/crates/engine-query/src/ontology.rs:51-58,74-120,127-146`; `graph.rs:51,124-156`; `lineage.rs:69-93,208-220`; `engine-graph/src/index.rs:717,822-849,860-928,943-987`.
- `frontend/src/stores/server/liveAdapters.ts:135-155,206-234`.
- `[[2026-06-14-graph-node-semantics-adr]]` (typed derivation vocabulary; "`generated-by` from the id container path, most reliable edge"; PROV); `[[2026-06-14-graph-representation-plan]]` (W01.P01-P03, W02.P05).
- Corpus measured 2026-06-16: 24 research / 44 adr / 31 plan / 642 exec / 17 audit / 4 reference / 46 index; all 642 exec carry one `related:` wikilink to their plan.
- Sugiyama: The Sugiyama Method (disy blog); Hierarchical Drawing Algorithms, Healy (Brown GD handbook); yWorks Layered Graph Layout. Provenance: CitNetExplorer (arXiv 1404.5322).
