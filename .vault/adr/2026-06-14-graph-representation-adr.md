---
tags:
  - '#adr'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-representation-research]]"
  - "[[2026-06-14-graph-node-semantics-adr]]"
  - "[[2026-06-14-graph-node-salience-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
---

# `graph-representation` adr: `graph representation: visualization principles and large-corpus algorithms` | (**status:** `accepted`)

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

**Three layout modes over one model, not one layout.** ForceAtlas2 stays the default
*connectivity* layout — its degree-dependent repulsion separates feature clusters and its
stated 10–10,000-node comfort zone validates the ceiling. But two further modes are added,
each motivated by research and by data we already hold. A **semantic layout mode** projects
the existing rag embeddings to 2D with UMAP (a "semantic constellation" that clusters by
meaning, not connectivity) — the cheapest high-value experiment in the whole campaign because
the embeddings already exist; DRGraph is the scale-hardened port if the mode proves valuable.
A **lineage layout mode** lays the directed derivation DAG (research→adr→plan→exec→audit→rule)
along a derivation/time axis — the CitNetExplorer and W3C PROV convention — because our
primary review task is path-following along lineage, the one task at which node-link
decisively beats matrices, and because the ADR-tooling ecosystem leaves exactly this
decision-DAG view unbuilt.

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
does not move nodes: GMap-style "feature countries" at the overview LOD, BubbleSets hulls at
document granularity (KelpFusion as the empirically-best upgrade target). Visual encoding
follows Bertin/Mackinlay/Munzner: **type → shape** (the icon mark, grayscale-safe per the
icon gate), **feature → hue** (colorblind-safe OKLCH), **salience → size** (making the
importance field visible), **lifecycle/recency → value** (low-chroma per warmth-in-tokens),
**tier → hue + dash** (surviving grayscale). The semantics ADR's lifecycle vocabulary drives
the state channels: a **superseded ADR reads faded/struck**, an audit's worst severity tints
its treatment, diff legibility (add/remove green/red) stays sacred under any theme.

**The frontier is adopted selectively, with AI as a grounded assistant.** Animated
add/remove for live deltas plus incremental layout (mental-map stability) is the empirically-
backed delta behavior. AI enters only as a *grounded, read-only* layer: a LinkQ-style "talk
to your vault" that turns a natural-language question into a bounded engine query (the LLM
never invents nodes), and LLM auto-labeling of feature/semantic clusters. GNN learned layout
is declined for now (it needs trained torch models, colliding with GPU-render-only and
wheel-purity, and offers nothing over FA2 at our bound). NodeTrix (matrix-in-node) is the
recorded escalation when a feature cluster grows too dense to read as node-link.

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
- **Depends on the sibling ADRs.** Salience (size, label priority, the DOI a-priori term) and
  semantics (type→shape, lifecycle→state channels, derivation→lineage layout) are accepted
  and supply the inputs this ADR encodes.

## Implementation

The representation is settled as a set of principles the node-canvas rendering surface and
the stores projections implement. **Interaction** is DOI-driven: the canonical loop is
overview (scoped constellation) → filter (type, tier, feature, lifecycle) → context (hover
ego-lift, focus) → detail (open-in-place), with search as a first-class entry point that
seeds a DOI-expanded contextual subgraph. The bounded wire serves the top-DOI nodes for the
active lens and focus, so what is on screen is always "the most interesting slice," not a
blind truncation.

**Layout** is three selectable modes over the one model. *Connectivity* (ForceAtlas2, the
default) for topology; *semantic* (UMAP over the existing rag embeddings, CPU worker) for a
meaning-clustered constellation; *lineage* (a directed derivation-axis DAG, type-shaped,
PROV-convention) for tracing decision-to-execution provenance. Each mode is a different
spatialization of the same nodes; switching modes re-lays-out with object constancy preserved
by stable id. **Level of detail** is semantic zoom: the constellation draws features as
labelled "countries" (GMap metaphor) with the salience field as size; descent swaps to
document granularity with full node anatomy, BubbleSets feature hulls, and document edges.

**The anti-hairball backbone** is the load-bearing algorithmic decision. Layout and the
default draw run on the declared+structural backbone; temporal and semantic edges are
disparity-filter-thinned to their significant subset, bundled hierarchically along the
feature/lineage containment so cross-cluster links read as clean arcs, gated by DOI and the
tier filter, and un-bundled on hover. The dense semantic tier is therefore present but never
smothering. **Encoding** applies the channel map (type→shape, feature→hue, salience→size,
lifecycle/recency→value, tier→hue+dash), with the semantics lifecycle vocabulary driving
state treatments — superseded ADRs faded, audit severity tinted, generated index nodes
visually distinct — and diff coloring overriding warmth during temporal replay.

**Dynamic behavior** animates live deltas (add fades in, remove fades out, re-tier is a
staged transition) and places new nodes incrementally rather than re-running the full layout,
preserving the mental map per the dynamic-graph evidence. **The AI layer** is grounded and
optional: a natural-language query is compiled by an LLM into a bounded engine query executed
by the stores layer and rendered as a normal result (the LLM contributes intent, never
nodes), and feature/semantic clusters may be auto-labelled by an LLM summary of their members
— both read-only, both degrading to absence honestly when unavailable. **Escalation paths**
are recorded but deferred: NodeTrix matrix-in-node for over-dense clusters, DRGraph for a
scale-hardened semantic layout, sfdp/multilevel for any future beyond-ceiling pre-layout.
This ADR pins the principles and the algorithm choices; the node-canvas ADR and the stores
projections carry them into the rendering and the wire; no application code is written here.

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
