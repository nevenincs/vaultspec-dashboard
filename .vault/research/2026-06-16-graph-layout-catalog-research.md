---
tags:
  - '#research'
  - '#graph-layout-catalog'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# Expanded layout catalog research

## Goal & the modes to add

The dashboard node-graph (PixiJS scene, `frontend/src/scene/`) ships three representation modes — `connectivity` (force-directed, the d3-force solver owns positions), `lineage` (deterministic derivation-DAG seed), `semantic` (UMAP, v1-gated/held) — plus a separate force/circular tuning toggle. The goal is to expand the catalog with the standard data-science network-visualization layouts to make the toolkit "Obsidian-plus":

- **Hierarchical / layered (Sugiyama)** — directed acyclic flow drawn in layers, edges flowing one direction with crossing minimization. The pipeline-DAG natural fit (a richer cousin of the existing `lineage` axis layout).
- **Radial / tree** — a tidy tree mapped onto polar coordinates; reads a root-anchored hierarchy as concentric rings. Needs a root-selection strategy for a general (non-tree) graph.
- **Community-clustered (Louvain/Leiden)** — modularity-based community detection partitions the nodes, then a clustered layout groups each community in space. The "show me the topic clusters" view.

All three are deterministic CPU spatializations — they fit the existing seam as seed-position producers, exactly like `lineage` and `circular`.

## Integration seam (how layouts plug in, file:line)

The seam is already shaped for additive deterministic layouts. There are two dispatch surfaces, both of which a new mode must touch.

**The mode dispatcher** — `frontend/src/scene/field/representationLayout.ts`:
- `RepresentationMode` union at `representationLayout.ts:27` (`"connectivity" | "lineage" | "semantic"`) is the type each new mode extends.
- `RepresentationLayoutResult` at `:32-44`: `positions: Map<string,{x,y}> | null` — a non-null Map is a deterministic seed (solver stopped over it); `null` means "the d3-force solver owns positions" (connectivity). `applied` echoes the actually-applied mode (supports honest downgrade), `downgradeReason` is the held-mode message.
- The dispatch `switch` at `:56-82`: `lineage` builds a position Map from `lineageLayout(...)` (`:57-63`); `semantic` is gate-held and downgrades to connectivity when `!SEMANTIC_MODE_GATE.shipped` (`:64-78`); `connectivity`/default returns `{ positions: null, applied: "connectivity" }` (`:79-82`). **A new deterministic mode is one new `case` that returns a populated `positions` Map.**

**The FieldLayout solver seam** — `frontend/src/scene/field/forceLayout.ts`:
- The seam interface is `init(nodeIds, edges, warmStart)` / `start()` / `stop()` / `setParams` / `onPositions` / `positions` / `setPinned` / `onSettle` / `destroy` (class at `forceLayout.ts:192`, `init` at `:245`, `start`/`stop` at `:285`/`:294`).
- Deterministic modes use exactly the `circular` pattern: `stop()`, then `init(nodeIds, [], seeds)` with **empty edges** so no springs run and the seeded positions are authoritative, then do *not* `start()` (the solver stays frozen). The warm-start seeding helper `seedPositions` (`:101-149`) and `LayoutEdgeRef` (`:40-44`) are the supporting shapes.

**The assembly that drives the seam** — `frontend/src/scene/field/fieldAssembly.ts`:
- `applyRepresentationMode(mode)` at `fieldAssembly.ts:605-652` is the worked dispatch: it calls `representationLayout(mode, nodes, edges)` (`:612`), and **if `result.positions` is non-null** it does `this.layout.stop(); this.layout.init(nodeIds, [], seeds)` then `fitToContent(..., true)` with the solver held stopped (`:615-630`); **else** (connectivity) it feeds `splitBackbone(edges).backbone` to the solver and `start()`s (`:631-644`). It then emits `representation-mode-changed` (`:646-651`).
- The `set-layout-mode` "circular" branch at `:546-569` is the second worked example of the stop-init-no-start deterministic seeding pattern (`circularArrange(nodeIds)` → `layout.init(nodeIds, [], positions)`, "Don't restart in circular mode").
- The re-seed path on a new slice (lens re-query) is `applyModelToLayers(reseed)` at `:753-827`, branch `:777-826`: a non-connectivity mode re-runs `representationLayout` and seeds explicitly (`:782-804`). **A new deterministic mode is automatically handled here** as long as `representationLayout` returns its positions and the `representationMode !== "connectivity"` guard at `:782` admits it.

**The node/edge data shapes** — `frontend/src/scene/sceneController.ts`:
- `SceneNodeData` at `:32-103` (`id`, `kind`, `featureTags?` at `:44`, `salience?` at `:77`). Community layouts can group by `featureTags`; Sugiyama/radial can rank by `salience` or `derivation`.
- `SceneEdgeData` at `:110-132`: `src`/`dst`/`relation`/`tier`/`confidence`, plus `derivation?` at `:131` (the pipeline-derivation label the lineage axis already consumes) and `meta?` (constellation aggregate edges).
- The `set-representation-mode` command at `:197` and `representation-mode-changed` event at `:246` — **no new command needed**; new modes ride the existing command by extending the `RepresentationMode` union.

**The selector chrome** — `frontend/src/app/stage/RepresentationModePanel.tsx`:
- `MODE_OPTIONS` array at `RepresentationModePanel.tsx:29-48` (one entry per mode: `{ mode, label, hint, Icon }`, Lucide icons). **A new mode is one new array entry.** The store wiring is `activeRepresentationMode`/`setRepresentationMode` in `frontend/src/stores/view/viewStore.ts:123,388` and the scene-command effect in `frontend/src/app/stage/Stage.tsx:357-362`. All four chrome/store touchpoints are additive.

**Net seam cost per new deterministic layout:** one `RepresentationMode` union member, one `case` in `representationLayout.ts`, one new framework-free `*Layout.ts` module under `frontend/src/scene/field/`, one `MODE_OPTIONS` entry. The assembly's stop-init-no-start path is already generic over "any mode that returns positions."

## Hierarchical / layered (Sugiyama)

**Algorithm.** The Sugiyama framework is four phases: (1) **cycle removal** — reverse a minimal edge set to make the graph acyclic; (2) **layer assignment** — assign each node an integer layer (longest-path, Coffman-Graham bounded-width, or network-simplex), inserting dummy nodes on edges that span multiple layers; (3) **crossing reduction** — order nodes within each layer to minimize edge crossings (iterated barycenter/median heuristic, or ILP-optimal); (4) **coordinate assignment** — assign x within a layer (Brandes-Köpf, or quadratic-program "vert"), y from the layer index. Output is one (x,y) per node — a deterministic seed.

**Complexity.** The heuristic pipeline is roughly O(V+E) per layering pass and O(layer-width²) per crossing-reduction sweep over a few iterations; for hundreds of nodes this is sub-millisecond-to-low-millisecond. The *optimal* (ILP/quadprog) crossing and coordinate strategies are exponential/expensive and must be avoided at scale — they are a configuration choice, not the default. Bounded to hundreds of LOD nodes (`graph-queries-are-bounded-by-default`), the heuristic pipeline is comfortably within the layout time budget.

**Libraries.**
- **d3-dag** (erikbrinkman) — v1.2.1, **MIT**, pure-computation TS/ESM. Runtime deps: `d3-array`, `javascript-lp-solver`, `quadprog`, `stringify-object`; **no DOM, no d3-selection/render**. Provides the full Sugiyama pipeline with swappable layering (`layeringLongestPath`/`Simplex`/`CoffmanGraham`), decross (`decrossTwoLayer` heuristic vs `decrossOpt` ILP), and coord (`coordGreedy`/`coordQuad`/`coordSimplex`) strategies. Returns node `x`/`y`. Fits a framework-free scene module — but note the `javascript-lp-solver`/`quadprog` deps are only pulled by the *optimal* strategies; using the pure-heuristic strategies still bundles them unless tree-shaken.
- **dagre** (dagrejs) — older, MIT, depends on `graphlib` + `lodash`; heavier and less actively maintained. Inferior to d3-dag for a fresh framework-free module.

**Maps onto the dispatcher.** Deterministic-seed mode. Build a DAG from the `derivation`/`declared`/`structural` edges (after cycle-removal), run the heuristic Sugiyama pipeline, scale layer-index → y and intra-layer x → world units, return the position Map. Solver held stopped (the circular/lineage pattern). This is effectively a 2-D generalization of the existing `lineageLayout` (which is already a single-axis longest-path layering at `lineageLayout.ts:82-105`) — a hand-rolled Sugiyama could even reuse that longest-path depth code and add a barycenter crossing-reduction sweep, avoiding the d3-dag dependency entirely.

## Radial / tree

**Algorithm.** d3-hierarchy's `d3.tree()` (Reingold-Tilford tidy tree) or `d3.cluster()` produces a tidy layered tree; mapping it to polar coordinates (`size([2π, radius])`, then `x`=angle, `y`=radius → `(r·cos θ, r·sin θ)`) yields the radial layout. The hard part for a *general graph* (not an intrinsic tree) is **root selection + tree extraction**: pick a salient root (highest `salience`, highest degree, or a feature-convergence node), then derive a spanning tree by **BFS** from that root — BFS gives the shortest-path tree, so radial distance reads as hops-from-root. Non-tree edges are rendered as context but excluded from the layout tree. Disconnected components get per-component roots laid out in separate sectors/rings.

**Complexity.** BFS is O(V+E); d3-hierarchy `tree`/`cluster` is O(V). Trivial at hundreds-to-thousands of nodes.

**Libraries.**
- **d3-hierarchy** — pure JS, **ISC** (same family/license as the already-shipped `d3-force`/`d3-ease`/`d3-interpolate`), **zero runtime dependencies, no DOM**. Provides `hierarchy`, `stratify`, `tree`, `cluster`. The cleanest, lowest-risk add — it sits exactly beside the existing d3-* deps.
- Root-picking and BFS spanning-tree extraction are ~30 lines of framework-free code in the new module; d3-hierarchy consumes a `{id, parentId}` stratify input or a children-accessor hierarchy built from the BFS tree.

**Maps onto the dispatcher.** Deterministic-seed mode. New module `radialLayout.ts`: pick root → BFS spanning tree → `d3.hierarchy` → `d3.tree().size([2π, R])` → polar→cartesian → position Map. Solver held stopped. Same stop-init-no-start shape as lineage.

## Community-clustered (Louvain/Leiden)

**Algorithm.** **Louvain** is greedy modularity maximization: (1) each node starts in its own community; (2) repeatedly move each node to the neighboring community that most increases modularity; (3) aggregate each community into a super-node and recurse, until modularity stops improving. Output is a node→community label map. **Leiden** is the refinement that guarantees well-connected communities (fixes Louvain's badly-connected-community defect) via a refinement phase. Then a **clustered layout** places communities: either (a) a two-level layout — lay communities out on a coarse circle/grid, then pack each community's members locally (force or circle-pack within the cluster), or (b) feed community membership as an extra attraction force to a force layout (a "grouped force" — but that re-introduces the solver, breaking the deterministic-seed pattern).

**Complexity.** Louvain runtime is bounded by edge count (near-linear); benchmarks process 50k-node graphs in <1s. At hundreds of LOD nodes it is negligible. Leiden is comparable. The clustered placement (circle-pack per community + community-of-communities arrangement) is O(V) deterministic.

**Libraries / the graphology question.**
- **graphology-communities-louvain** — MIT, but **requires a `graphology` Graph instance as input**. `graphology` is **NOT currently a dependency** — it was the *retired* layout library (ForceAtlas2 worker) replaced by d3-force in the `2026-06-15-dashboard-node-graph-stability` cycle (`forceLayout.ts:3` comment). `sigma` remains a dead `package.json` entry (`package.json:38`) but is imported nowhere in `src`. **Re-adopting graphology purely to get Louvain re-introduces the dependency the stability campaign deliberately retired** — a tension to weigh in the ADR.
- **Leiden** has no maintained pure-JS graphology-compatible implementation; canonical implementations are Python/C++.
- **Alternative: hand-rolled Louvain.** Louvain over a plain `SceneEdgeData[]` adjacency is a self-contained ~150-line framework-free module (modularity gain + community-merge loop) — no graphology, no dependency, fully CPU/framework-free. Given the bounded node count this is performant and dependency-pure.

**Maps onto the dispatcher.** Deterministic-seed mode. New module `communityLayout.ts`: build adjacency from `splitBackbone(edges).backbone` → Louvain → community labels → arrange communities (outer circle) + pack members within each (inner circle-pack) → position Map. Solver held stopped. Optionally color/hull by community via the existing overlay layer (`featureHulls` at `viewStore.ts:129`).

## Dependency & rule-compliance analysis (CPU-only, bounded, framework-free, wheel purity)

- **`graph-compute-is-cpu-gpu-is-render-and-search`** — all three layouts are CPU compute in framework-free scene modules producing world coordinates the GPU only draws. No layout goes on the GPU; no layout goes to the engine. Fully compliant — they mirror `lineageLayout`/`circularLayout`.
- **`graph-queries-are-bounded-by-default`** — layouts run over the LOD-bounded served slice (hundreds of nodes). Sugiyama-heuristic / d3-tree / Louvain are near-linear at that scale; **the ADR must forbid the exponential strategies** (d3-dag `decrossOpt`/`coordSimplex` ILP).
- **Framework-free** — d3-hierarchy (ISC, zero deps, no DOM) and d3-force (already shipped) are the safe family; d3-dag (MIT, pulls `javascript-lp-solver`/`quadprog`) is acceptable but heavier; hand-rolled Sugiyama and Louvain are zero-dependency. **graphology is the one library to avoid re-adopting**.
- **Wheel purity (`published-wheel-purity`)** — frontend npm deps only; no Python wheel/torch/rag concern. The only concern is bundle weight and re-introducing a retired lib.
- **`dashboard-layer-ownership`** — all compute stays in `frontend/src/scene/field/`; chrome only writes the mode to the view store; nothing fetches the engine or reads `tiers`. Compliant.

## Recommended approach per layout

- **Radial / tree** — **adopt `d3-hierarchy`** (ISC, zero-dep, sits beside the existing d3-* family). Lowest risk, highest reuse. Add a small BFS-spanning-tree + root-picker (salience/degree) helper.
- **Hierarchical / layered (Sugiyama)** — **prefer a hand-rolled heuristic Sugiyama** that extends the existing `lineageLayout` longest-path layering (`lineageLayout.ts:82-105`) with a barycenter crossing-reduction sweep and simple x-coordinate assignment — zero new dependency, generalizes code the project already owns. Fall back to **d3-dag (heuristic strategies only)** if optimal crossing minimization is later wanted.
- **Community-clustered** — **prefer a hand-rolled framework-free Louvain** over `SceneEdgeData` adjacency, to avoid re-introducing the retired `graphology` dependency. Pair with a deterministic two-level clustered placement and reuse the existing `featureHulls` overlay for cluster hulls. Leiden is deferrable.

All three are deterministic-seed modes: stop the solver, seed explicit id-keyed positions via `layout.init(nodeIds, [], seeds)`, hold stopped, fit-once — the exact `lineage`/`circular` pattern at `fieldAssembly.ts:615-630` and `:546-556`, preserving object constancy across mode switches.

## Open questions for the ADR

- **Solver-vs-seed for community mode**: deterministic clustered placement (held solver, mental-map stable) vs. a "grouped force" that adds community attraction to the live solver (organic but non-deterministic). Which idiom?
- **Sugiyama: build vs. d3-dag** — is the LP/quadprog bundle cost acceptable, or does the hand-rolled extension cover the need? How does Sugiyama relate to the existing `lineage` mode — replacement, "richer lineage," or distinct mode?
- **Root-selection policy for radial** — salience-max vs. degree-max vs. feature-convergence vs. user-selected node as root? Per-component roots — sectors or separate rings?
- **Re-introducing graphology** — acceptable for Louvain (and remove the dead `sigma` dep), or must community detection be hand-rolled to honor the stability-cycle retirement?
- **Edge input per layout** — which tiers feed each layout? Reuse `splitBackbone` (`backbone.ts:41`) for all?
- **Cycle handling for Sugiyama** — which cycle-removal heuristic, and do reversed edges render differently?
- **Mode count & chrome** — 6+ modes: flat button row or grouped picker? Does the gated-downgrade `semantic` precedent apply to any of these?
- **Determinism** — Louvain RNG must be seeded for stable communities (mirror lineage's deterministic id-sort).

## References

**Project files (file:line):**
- `frontend/src/scene/field/representationLayout.ts:27,32-44,56-82`; `forceLayout.ts:40-44,101-149,192,245,285-301`; `fieldAssembly.ts:546-569,605-652,753-827`; `circularLayout.ts:18-36`; `lineageLayout.ts:61-156`; `backbone.ts:41-54`; `sceneController.ts:32-103,110-132,197,246`; `app/stage/RepresentationModePanel.tsx:29-48`; `stores/view/viewStore.ts:123,388`; `app/stage/Stage.tsx:357-362`; `frontend/package.json:26-39` (`sigma` dead entry; no graphology, no d3-dag/d3-hierarchy).

**Vault grounding:** `[[2026-06-14-graph-representation-adr]]` (mode-vs-lens composition, seed-vs-solver dispatch); `[[2026-06-15-dashboard-node-graph-stability-research]]` (graphology/FA2 retired for d3-force; seam contract). Rules `graph-compute-is-cpu-gpu-is-render-and-search`, `graph-queries-are-bounded-by-default`, `dashboard-layer-ownership`, `published-wheel-purity`.

**Web (versioned):** d3-dag v1.2.1 MIT (github.com/erikbrinkman/d3-dag); d3-hierarchy ISC zero-dep (d3js.org/d3-hierarchy/tree); graphology-communities-louvain MIT (graphology.github.io/standard-library/communities-louvain); dagre MIT; Leiden (Traag et al. 2019, nature.com/articles/s41598-019-41695-z).
