---
tags:
  - '#adr'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-22'
related:
  - "[[2026-06-14-graph-representation-research]]"
  - "[[2026-06-14-graph-node-semantics-adr]]"
  - "[[2026-06-14-graph-node-salience-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
---

# `graph-representation` adr: `graph representation: visualization principles and large-corpus algorithms` | (**status:** `accepted`)

> **Amendment (2026-06-16, `2026-06-16-figma-parity-reconciliation-adr`).** The
> *tier-edge color encoding* on the headline canvas — coloring edges by relationship tier —
> is superseded by the binding Figma treatment: flat grey edges (the connection field reads
> as neutral topology, with emphasis carried by selection/hover, not per-edge hue). The
> representation principles (Degree-of-Interest, semantic-zoom LOD, backbone-runs-layout,
> bounded top-DOI wire) and the edge-tier **data** are **retained**; only the canvas color
> encoding of edges changed. This ADR's principle and data decisions remain authoritative.

## Problem Statement

The dashboard renders a knowledge vault as a node graph, and the easiest version of that —
a global, unfiltered, force-directed field of every document — is a trap. The Tier-2
literature is unambiguous: the Obsidian/Roam "graph view" is admired and seldom used because
it shows topology but not task-relevant state, degrading from useful at ~50 nodes to a
hairball by ~500. Our corpus reaches millions of nodes underneath a bounded wire, with a
dense, low-precision semantic tier that will smother any naive layout. The node-canvas ADR
already recodified the *rendering surface* — silhouette-by-type, four tier line treatments,
ego-lift focus, semantic-zoom LOD, meta-edge ribbons, open-in-place. What is not yet settled
is the **data-visualization principles and the large-corpus algorithms** that decide *which
nodes are shown, how they are laid out, how the hairball is averted, how clusters and lineage
are represented, and how the bleeding edge (embedding layouts, animated deltas, AI-assisted
exploration) is adopted or declined**. Without those decisions pinned, every future view
risks reinventing a hairball.

This ADR settles the representation principles: the interaction model (Degree-of-Interest,
search-show-context-expand), the level-of-detail and layout strategy (semantic zoom;
connectivity, semantic, and lineage layout modes), the anti-hairball backbone discipline,
the feature-cluster and encoding choices, the dynamic-delta behavior, and the adopt/study/
watch verdict on the 2020–2026 frontier including AI-assisted exploration. It is the
principles-and-algorithms layer that the node-canvas rendering ADR consumes; it is spec
work, grounded in the tiered representation research, and writes no code.

## Considerations

**The governing interaction model is Degree-of-Interest, and "overview first" is
reinterpreted as "search → show context → expand."** Furnas's DOI (`interest =
a-priori-importance − distance-from-focus`) and van Ham & Perer's graph adaptation resolve
the central tension: at million-node scale a global overview is neither possible nor
desirable, so the entry point is a search or focus and context grows outward. DOI is not just
an interaction metaphor — it is the *selection rule* for the bounded wire: serve the top-DOI
nodes for the active lens and focus, where a-priori-importance is precisely the salience ADR's
per-lens field. The node ceiling stops being an arbitrary truncation and becomes a principled
"keep the most interesting N."

**Three layout modes over one model — with an explicit v1/deferred split.** Layout is not a
menu of co-equal options; the decision is phased. **v1 adopts two modes: connectivity
(ForceAtlas2, the default) and lineage.** ForceAtlas2's degree-dependent repulsion separates
feature clusters and its stated 10–10,000-node comfort zone validates the ceiling. The
**lineage mode** lays the directed derivation DAG (research→adr→plan→exec→audit→rule) along a
derivation/time axis — the CitNetExplorer and W3C PROV convention — and is v1 because our
primary review task is path-following along lineage (the one task at which node-link decisively
beats matrices) and because the ADR-tooling ecosystem leaves exactly this decision-DAG view
unbuilt; it consumes the semantics ADR's `derivation` edge labels and needs no new wire data.
The **semantic mode** (UMAP over the existing rag embeddings, a "meaning constellation") is a
**v1 experiment gated on a measurable trigger**: it promotes to a shipped mode when the
CPU-worker UMAP projection over the node-ceiling slice lands inside the layout time budget *and*
a usability check confirms meaning-clusters separate legibly; failing the gate it is held out of
v1, and **DRGraph** is its deferred scale-hardened successor, promoted only when a measured
UMAP runtime at the ceiling exceeds that budget. The split is recorded in the Frontier ledger
below.

**The hairball is averted by a backbone discipline that our tiers already encode.** Dense
small-world graphs collapse under force layout; the canonical fix is backbone extraction, and
our four provenance tiers *are* an edge-importance ranking. Lay out and draw on the
high-precision structural backbone (declared + structural); layer the noisy temporal and
semantic tiers as **bundled** (hierarchical edge bundling along the containment hierarchy),
**DOI-gated**, **filterable**, and **disparity-filter-thinned** context. This is one decision
that simultaneously serves layout legibility, the salience backbone, and the project's
identity discipline.

**Feature clusters are set overlays, not a second layout; encoding follows channel theory.**
Feature membership is orthogonal to the connectivity layout, so it renders as an overlay that
does not move nodes: GMap-style "feature countries" at the overview LOD, **BubbleSets hulls
(v1)** at document granularity. **KelpFusion** is the deferred, empirically-best upgrade,
promoted when overlapping feature hulls at document LOD cross a measured legibility threshold
(hull-overlap area per view above a user-tested floor). Visual encoding
follows Bertin/Mackinlay/Munzner: **type → shape** (the icon mark, grayscale-safe per the
icon gate), **feature → hue** (colorblind-safe OKLCH), **salience → size** (making the
importance field visible), **lifecycle/recency → value** (low-chroma per warmth-in-tokens),
**tier → hue + dash** (surviving grayscale). The semantics ADR's lifecycle vocabulary drives
the state channels: a **superseded ADR reads faded/struck**, an audit's worst severity tints
its treatment, diff legibility (add/remove green/red) stays sacred under any theme.

**The frontier is adopted selectively, and the AI layer is explicitly deferred past v1.**
**v1 ships** animated add/remove for live deltas plus incremental layout (mental-map
stability) — the empirically-backed delta behavior, and a core requirement, not frontier. The
**AI layer is deferred to a post-v1 phase**: a LinkQ-style "talk to your vault" (an LLM
compiling a natural-language question into a bounded engine query, never inventing nodes) and
LLM auto-labeling of clusters are both *adopted-deferred*, gated on the grounded-query seam
existing in stores and an availability/degradation contract; neither blocks v1, and both must
be grounded and read-only when they land. **GNN learned layout is declined permanently** (it
needs trained torch models, colliding with GPU-render-only and wheel-purity, and offers nothing
over FA2 at our bound), as is **cosmos.gl's GPU-layout model**. **NodeTrix** (matrix-in-node) is
the deferred escalation, promoted when a single feature cluster's intra-cluster edge density at
document LOD exceeds a measured legibility threshold (edges/node above K). All verdicts are
consolidated in the Frontier ledger below.

## Constraints

- **GPU renders; graph compute and layout are CPU.** Every layout (ForceAtlas2, the UMAP
  projection, the lineage ordering, disparity filtering, edge bundling geometry) runs on the
  CPU worker over engine-served nodes; the GPU draws sprites, meshes, hulls, and bundles. The
  engine holds no layout coordinates, so spatial concerns (viewport culling, fit-to-view, the
  set hulls) are client-side geometry over scene-owned positions. cosmos.gl's GPU-layout model
  is explicitly *not* adopted — only its rendering tricks.
- **Bounded by default; DOI is the bounding rule.** The default view is the scoped
  constellation; descent is a scoped, ceiling-bounded query; the wire never carries an
  unbounded slice. A truncated bounded query renders the `truncated` block honestly as a
  "narrow your view" state, never a partial graph presented as complete.
- **No torch at runtime; AI is an optional, gracefully-degrading layer.** The UMAP mode runs
  on CPU over embeddings already served; no GNN-trained-model layout and no runtime torch
  dependency enters the published wheel. The AI query/labeling layer is grounded in
  ground-truth graph data, never a source of graph facts, and degrades to absence (read from
  the tiers block) when its backing service is down — it never fabricates availability.
- **One model, projected; the scene is a dumb view fed through the seam.** Every mode is a
  projection over the one `LinkageGraph`; the scene receives data only via `SceneController`
  commands and emits selection/hover/open/expand back via its event channel. No view fetches
  the engine, defines its own node shape, or reads the raw tiers block — the stores layer is
  the sole wire client. This ADR adds modes and overlays; it does not add a second model.
- **Inherits the node-canvas seam and the design tokens.** Concrete marks, line treatments,
  colors, and motion durations come from the shared `:root` token layer (read into the scene
  via `getComputedStyle`, scene-read tokens emitted as literal hex) and the sanctioned icon
  families through the existing `GlyphTextureProvider` seam. Identity never rests on hue;
  grayscale-safe-by-shape holds; warmth lives in tokens; motion is fast/subtle and
  keyboard-initiated actions do not animate.
- **Inherits filter ownership; does not re-own it.** Filter active-state (type / tier / feature
  / lifecycle) ownership and propagation are already settled by the canvas-controls ADR (app
  chrome emits filter intent into the stores view-store; stores re-queries; the engine validates
  the filter vocabulary). This ADR inherits that unchanged and adds no competing filter owner.
- **Requires downstream amendments to two accepted consumer ADRs.** node-canvas and
  canvas-controls were authored before this trio and lack the seams it assumes; this ADR names
  the required amendments explicitly (size-driver, label-priority, representation-mode command,
  mode/lens selector controls) in Implementation rather than silently assuming them.
- **Depends on the sibling ADRs.** Salience (size, label priority, the DOI a-priori term) and
  semantics (type→shape, lifecycle→state channels, derivation→lineage layout) are accepted
  and supply the inputs this ADR encodes. The dependency order is **semantics → salience →
  representation → (node-canvas + canvas-controls, as downstream consumers requiring
  amendment)**; the chain is acyclic.

## Implementation

The representation is settled as a set of principles the node-canvas rendering surface and
the stores projections implement. **Interaction** is DOI-driven: the canonical loop is
overview (scoped constellation) → filter (type, tier, feature, lifecycle) → context (hover
ego-lift, focus) → detail (open-in-place), with search as a first-class entry point that
seeds a DOI-expanded contextual subgraph. The bounded wire serves the top-DOI nodes for the
active lens and focus, so what is on screen is always "the most interesting slice," not a
blind truncation.

**Layout** is selectable modes over the one model, each a different spatialization of the
*same served nodes*. *Connectivity* (ForceAtlas2, the v1 default) for topology; *lineage* (a
directed derivation-axis DAG, type-shaped, PROV-convention, consuming the semantics ADR's
`derivation` edge labels) for tracing decision-to-execution provenance — **both v1**; and
*semantic* (UMAP over the rag embeddings, CPU worker) for a meaning-clustered constellation —
**v1-gated** per the trigger above. Each mode's **data source** is named: connectivity and
lineage run on the §4 node/edge payload already served (lineage needs only the `derivation`
labels, no new wire data); the semantic mode needs **per-node embedding vectors delivered to
the CPU worker**, which is a §4 amendment — the engine serves the rag embedding vectors as an
optional additive node field (or a paired bounded endpoint), and the worker runs UMAP on them
(the engine never serves coordinates, honoring graph-compute-is-CPU). **Empty/degraded states
are owned here:** semantic mode draws nodes lacking an embedding in a connectivity fallback
position and says so; lineage mode draws an incomplete derivation chain honestly (an orphan
exec record, or a plan whose ADR is absent, renders as a dangling lineage stub, never a
fabricated edge — matching the engine's honest-degradation stance). **Level of detail** is
semantic zoom: the constellation draws features as labelled "countries" (GMap metaphor) with
the salience field as size; descent swaps to document granularity with full node anatomy,
BubbleSets feature hulls, and document edges.

**The anti-hairball backbone** is the load-bearing algorithmic decision. Layout and the
default draw run on the declared+structural backbone; temporal and semantic edges are
disparity-filter-thinned to their significant subset, bundled hierarchically along the
feature/lineage containment so cross-cluster links read as clean arcs, gated by DOI and the
tier filter, and un-bundled on hover. The dense semantic tier is therefore present but never
smothering. **Encoding** applies the channel map (type→shape, feature→hue, salience→size,
lifecycle/recency→value, tier→hue+dash), with the semantics lifecycle vocabulary driving
state treatments — superseded ADRs faded, audit severity tinted, generated index nodes
visually distinct — and diff coloring overriding warmth during temporal replay. Note two
distinct "backbones": the **centrality backbone** the salience ADR computes on is tier-*weighted*
(all four tiers, declared ≥ structural ≫ temporal ≥ semantic), while the **layout backbone**
drawn here is the high-precision *subset* (declared + structural only, with temporal/semantic as
layered context, not layout input). They share an intent but are not the same structure; an
implementer builds both.

**Switching mechanism and ownership.** Representation-mode switching is a **new `SceneController`
command** (`set-representation-mode: connectivity | lineage | semantic`), explicitly **distinct
from the existing render-tuning `set-layout-mode` (force | circular)** that the canvas-controls
AlgorithmPanel already owns — the two are different axes (representation mode changes which CPU-
worker layout runs and what data it consumes; force/circular only tunes the force solver).
Active representation-mode is **view state owned by the stores/app view-store**, emitted to the
scene, which re-runs the mode's worker layout and echoes a `representation-mode-changed` event.
**Object constancy across a mode switch** is carried by the scene's existing id-keyed sprite
reconciler and position cache: the new layout seeds its animated transition from prior id-keyed
positions, and no node is re-keyed. Overlay visibility (feature hulls, country labels on/off) is
view state owned by the view-store and emitted as a dedicated `set-overlays` command; the scene
toggles the hull layer without re-layout. The **default first-load state is the connectivity
mode under the status lens**.

**Composition — lens and mode are orthogonal and freely combinable.** The lens (an engine/wire
concern: a query parameter selecting the salience field and, via DOI, the served node *set*) and
the representation mode (a scene concern: a CPU-worker spatialization of whatever nodes are
served) are independent axes — one selects *which nodes and how important*, the other *where they
sit* — and every lens must be viewable in every mode (status lens + lineage mode is a first-class
combination). The stores layer owns both active selections and **sequences them**: a lens switch
is a re-query that delivers a possibly-different node set, which the active mode re-lays-out with
id-keyed object constancy; a mode switch re-lays-out the current set with no re-query. This
single rule is what keeps the two switches from contending.

**Required downstream amendments (named, not assumed).** Adopting these principles requires
amending two accepted consumer ADRs, and this ADR states each so an executor does not invent it:
(1) a **node-canvas amendment** for `salience → size` — node-canvas currently pins radius to
feature member-count and holds all other species at base radius; that rule is **superseded** by
salience-driven size (member-count folds into the feature node's salience, so the two no longer
compete), and node-canvas's label culling gains salience as a label-priority input; (2) a
**canvas-controls amendment** adding the **representation-mode selector** (and reconciling it with
the existing force/circular toggle, which becomes a sub-option of connectivity) and the **lens
selector** control group. These amendments are scoped by the plans this ADR seeds.

### Frontier ledger

Every technique surfaced by the representation research, with its verdict, promotion trigger, and
reason. `adopt-v1` ships in the first build; `adopt-deferred` is decided-in but scheduled later
behind a trigger; `study` is a reference implementation to learn from; `decline` is a permanent
no.

| Technique | Verdict | Trigger / reason |
|---|---|---|
| DOI bounded selection (Shneiderman/Furnas/van Ham-Perer) | adopt-v1 | the interaction + wire-selection spine |
| Semantic zoom LOD (Pad++) | adopt-v1 | the focus+context mechanism |
| ForceAtlas2 connectivity layout | adopt-v1 | default; in-sweet-spot at the ceiling |
| Lineage derivation-DAG layout (CitNetExplorer/PROV) | adopt-v1 | primary path-following task; consumes `derivation` labels |
| Backbone draw + HEB bundling + disparity filter | adopt-v1 | the anti-hairball discipline |
| BubbleSets feature hulls | adopt-v1 | v1 overlay |
| GMap "feature countries" overview | adopt-v1 | overview LOD metaphor |
| Channel encoding (Bertin/Mackinlay/Munzner) | adopt-v1 | type→shape, feature→hue, salience→size, etc. |
| Animated deltas + incremental layout | adopt-v1 | mental-map stability (core, not frontier) |
| Semantic UMAP layout mode | adopt-v1-gated | promotes when worker UMAP at ceiling is within the layout time budget and clusters separate legibly |
| KelpFusion overlay | adopt-deferred | when hull-overlap legibility threshold is crossed |
| LinkQ "talk to your vault" query | adopt-deferred | when the grounded-query stores seam + degradation contract exist |
| LLM cluster auto-labeling | adopt-deferred | read-only, grounded; after the labeling seam exists |
| NodeTrix matrix-in-node | adopt-deferred | when intra-cluster edge density exceeds the legibility threshold |
| DRGraph scale-hardened DR layout | adopt-deferred | when UMAP runtime at the ceiling exceeds the budget |
| sfdp / multilevel pre-layout | adopt-deferred | only for a future beyond-ceiling pre-layout need |
| Embedding Atlas / Nomic Atlas | study | reference for semantic + cluster-label at scale |
| cosmos.gl rendering tricks | study | adopt instancing/culling; reject its GPU-layout model |
| GNN learned layout (DeepGD/CoRe-GD/etc.) | decline | needs runtime torch (wheel-purity); no gain at our bound |
| cosmos.gl GPU-layout model | decline | violates GPU-render-only / engine-holds-no-coordinates |

**Dynamic behavior (v1)** animates live deltas (add fades in, remove fades out, re-tier is a
staged transition) and places new nodes incrementally rather than re-running the full layout,
preserving the mental map per the dynamic-graph evidence. **The AI layer (deferred)** is, when
it lands post-v1, grounded and read-only: a natural-language query is compiled by an LLM into a
bounded engine query executed by the stores layer and rendered as a normal result (the LLM
contributes intent, never nodes), and clusters may be auto-labelled by an LLM summary of their
members — both degrading to absence honestly when unavailable. It is `adopt-deferred` in the
ledger, not v1 scope. **Escalation paths** (NodeTrix, DRGraph, sfdp) are likewise deferred behind
the triggers in the ledger. This ADR pins the principles, the v1/deferred split, and the
switching/composition mechanisms; the plans it seeds carry them into the engine, the wire, and
the node-canvas/canvas-controls amendments — no application code is written in this ADR.

## Rationale

The decisions are almost entirely *what the research converged on*, applied through the
project's existing seams. DOI is cited across all three tiers as the formal answer to "large
graph, small screen," and it unifies the interaction loop with the salience field and the
node ceiling into one selection rule. The three layout modes are justified individually:
ForceAtlas2's own paper endorses our bound; the UMAP mode is nearly free because we already
own embeddings (the single highest-leverage insight of the bleeding-edge tier); the lineage
mode follows CitNetExplorer/PROV and fills the documented blank space in ADR tooling, serving
the path-following task at which node-link wins. The backbone discipline is the canonical
anti-hairball move (Nocaj/Brandes lineage) made cheap because our tiers already rank edges by
precision, and it reuses the same backbone the salience ADR computes on — one idea paying
three debts (legibility, ranking, identity discipline). Set overlays and the channel-encoding
map are textbook (BubbleSets/KelpFusion, Bertin/Mackinlay/Munzner) and ground the project's
existing grayscale/icon/token rules in theory. The AI verdict is deliberately conservative:
the frontier is strong for grounded querying and labeling and weak for spatial navigation, so
we adopt the LinkQ pattern (which honors read-and-infer and stores-as-sole-client perfectly)
and decline learned layout (which would breach wheel-purity for no gain at our scale). The
through-line is the Tier-2 negative lesson: a global untyped force-directed graph is a
beautiful hairball, so the product's value comes from scoped, typed, lineage-aware,
status-bearing, salience-ranked projections — which is exactly what these principles pin.

## Consequences

- **Gains.** The product gets a principled answer to "what do we draw and how" that averts the
  hairball by construction: DOI selects the slice, the backbone tames the dense tiers, three
  layout modes serve topology/meaning/lineage from one model, set overlays carry features, and
  the channel map keeps identity grayscale-safe. The UMAP semantic mode and the grounded AI
  layer are high-value, low-risk additions that exploit assets we already hold. Every choice
  lands at an existing seam (node-canvas rendering, stores projection, the token layer), so
  adoption is inheritance, not re-architecture.
- **Costs and difficulties.** Three layout modes plus set overlays plus edge bundling is real
  rendering and interaction complexity, and the mode switch must preserve object constancy.
  The UMAP projection and disparity filtering are new CPU-worker computations to build and
  bound. The lineage layout needs the semantics ADR's typed derivation edges to be reliable.
  The AI layer adds an external dependency that must degrade honestly and stay strictly
  grounded.
- **Risks.** Decorative motion or a second accent could creep into the largest, most tempting
  surface and erode the instrument register; warmth must stay in tokens. A future view could be
  tempted to fetch the document graph unbounded for "completeness" — the bounded-default and
  DOI-selection laws must hold. An ungrounded AI feature, or one that fabricates nodes or
  guesses availability, would violate the truthfulness stance; the LinkQ grounding discipline
  is non-negotiable. A learned-layout temptation must be resisted while it breaches
  wheel-purity for no scale benefit.
- **Pathways opened.** A DOI-bounded, backbone-disciplined, multi-mode representation gives
  every future view a stable grammar: a table or matrix projection, an audit/compliance lens,
  a "meaning-drift over time" semantic-temporal view (Chronotome-style), or a richer AI
  exploration all become projections over the one model rather than new hairballs. The
  adopt/study/watch ledger gives a future agent a clear, evidence-backed map of where the
  frontier is worth revisiting.

## Codification candidates

- **Rule slug:** `the-default-graph-view-is-scoped-not-global`.
  **Rule:** The dashboard never serves or draws a global, unfiltered, full-corpus
  force-directed graph; the default is a DOI-bounded scoped view (search → show context →
  expand), and the node ceiling is a top-DOI selection, never a blind truncation. (Candidate
  only; must hold across a full execution cycle before promotion.)
- **Rule slug:** `layout-runs-on-the-backbone-noisy-tiers-are-layered-context`.
  **Rule:** Graph layout and the default draw run on the high-precision declared/structural
  backbone; temporal and semantic edges are disparity-thinned, bundled, DOI-gated,
  filterable context layered on top — never raw inputs to the layout. (Candidate only;
  pending a cycle of use.)
- **Rule slug:** `ai-graph-assist-is-grounded-and-read-only`.
  **Rule:** Any AI/LLM graph feature contributes query intent or labels grounded in
  ground-truth graph data only; it never invents nodes or edges, never sources graph facts,
  and degrades to honest absence (read from the tiers block) when unavailable. (Candidate
  only; pending a cycle of use.)
