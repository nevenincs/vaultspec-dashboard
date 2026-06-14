---
tags:
  - '#research'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-node-salience-research]]"
  - "[[2026-06-14-graph-node-semantics-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
---

# `graph-representation` research: `graph representation: bleeding-edge visualization for large document corpuses`

This is the visualization-and-algorithms grounding for the second-brain graph dashboard.
The product renders the engine's `LinkageGraph` — a heterogeneous corpus of typed
documents (research, reference, ADR, plan, execution-record, audit, rule) with a
plan-to-execution parent/child hierarchy, feature clusters, and four provenance edge
tiers (declared wiki-links, structural code-references, temporal commit-correlations,
semantic rag-similarity). The corpus can reach millions of nodes; the wire is bounded
to a node ceiling with level-of-detail; ForceAtlas2 runs on a CPU worker and the GPU
only renders. The question this research answers: which representation mechanisms — from
the established canon to the 2020–2026 frontier — actually let a reviewer *overview,
filter, and see work done for context*, and which are ornament. The literature is tiered
deliberately: Tier 1 is the durable information-visualization canon, Tier 2 is
domain-specific knowledge-graph / PKM / scientific-mapping practice, Tier 3 is the
bleeding edge. A companion structural fact governs everything below: **our graph is a
*compound* graph** — a containment tree (plan-to-exec, feature-to-document) plus non-tree
adjacency (the four tiers) — and a large fraction of the strongest techniques were
invented specifically for compound graphs, which makes them unusually applicable here.

## Findings

### Tier 1 — Information-visualization canon

**The DOI interaction stack (load-bearing spine).** Three frameworks compose into one
coherent interaction model and should be treated as the product's grammar.

- Shneiderman's Visual Information-Seeking Mantra — "overview first, zoom and filter,
  then details-on-demand" plus a task/data-type taxonomy. Maps 1:1 onto our LOD: overview
  = constellation/feature LOD; zoom/filter = semantic-zoom descent + tier filtering;
  details = the node detail/interior. *Shneiderman 1996, IEEE VL.
  https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf*
- Furnas's Generalized Fisheye Views introduced **Degree-of-Interest**:
  `DOI(x | focus) = API(x) − dist(x, focus)`, where API is *a-priori importance*. The
  two terms map cleanly onto fields we already own — API is a typed/structural prior
  (document type, parent/child rank, feature centrality, tier weight) and `dist` is graph
  distance from focus — so the node ceiling becomes "serve the top-DOI N nodes for this
  focus" rather than an arbitrary truncation. *Furnas 1986, ACM CHI.
  https://cspages.ucalgary.ca/~saul/581/exer.eps/4furnas86.pdf*
- van Ham & Perer's "Search, Show Context, Expand on Demand" adapts DOI from trees to
  general graphs and, crucially, argues that at million-node scale a global overview is
  *neither possible nor desirable* — you start from a search/focus and grow context
  outward. This is the single most directly applicable precedent for our product, and it
  dovetails with our semantic/rag tier (search *is* the entry point). *van Ham & Perer
  2009, IEEE TVCG 15(6). https://perer.org/papers/adamPerer-DOIGraphs-InfoVis2009.pdf*

**Focus+context — adopt semantic zoom, not distortion.** Geometric distortion
(bifocal display, perspective wall, hyperbolic/H3 browsers; Spence & Apperley 1982,
Mackinlay et al. 1991, Lamping et al. 1995, Munzner 1997) is canonical-but-dated for a 2D
typed node-link field: hyperbolic layouts disorient and fight ForceAtlas2. The durable
descendant is **semantic zoom** (Pad++; Perlin & Fox 1993, Bederson & Hollan 1994):
representation changes with scale (a feature renders as one labelled mark zoomed out;
individual typed nodes appear zoomed in), which is exactly our LOD wire and fits the
CPU-decides-which-tier / GPU-does-continuous-zoom split. Graphical fisheye and EdgeLens
(Sarkar & Brown 1992; Wong et al. 2003) survive only as an optional *transient hover lens*
for de-cluttering a hub, not a base view. *https://graphics.stanford.edu/papers/h3/*

**Edge & structure at scale — the compound-graph payoff.**
- Hierarchical Edge Bundling routes adjacency edges along the containment tree and bundles
  shared routes, trading edge traceability for pattern legibility. Practically designed
  for our shape: bundle the high-volume tiers (rag-similarity, temporal) along the
  feature-containment hierarchy so cross-feature links read as clean arcs, with on-hover
  un-bundling. *Holten 2006, IEEE TVCG 12(5).
  https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf*
- The node-link vs adjacency-matrix study is a design *warning*: beyond ~20 nodes,
  matrices beat node-link on most tasks **except path-following**, where node-link wins.
  Our primary tasks *are* lineage/path tasks (trace ADR-to-plan-to-exec), which justifies
  node-link as the base — but motivates NodeTrix-style embedded matrices for dense local
  neighborhoods. *Ghoniem et al. 2004, IEEE InfoVis. https://hal.science/hal-00343819v1;
  NodeTrix — Henry et al. 2007, IEEE TVCG 13(6).*
- Confluent drawing (Dickerson et al. 2005, arXiv cs/0212046) is niche; borrow only the
  metaphor of collapsing a near-clique tier into a single junction glyph.

**Feature clusters as set overlays.** Feature membership is orthogonal to the
connectivity layout, so it belongs as an overlay that does not move nodes. BubbleSets
(isocontour hull over members; Collins et al. 2009) is the v1 default; LineSets (Alper et
al. 2011) is the low-clutter alternative under heavy overlap; KelpFusion (Meulemans et al.
2013) empirically beat both and is the aspirational upgrade. At the overview LOD, the
GMap "graph as map / feature countries" metaphor (Gansner et al. 2010, arXiv 0907.2585)
is the intuitive idiom — features as labelled territories — switching to BubbleSets/Kelp
overlays on descent.

**Layout canon — we already chose well.** ForceAtlas2 (Jacomy et al. 2014, PLOS ONE) is
Barnes-Hut O(n log n), degree-dependent repulsion that *explicitly separates clusters*
(serving our feature geography), with a stated comfort zone of 10–10,000 nodes — which
validates the node ceiling. Fruchterman-Reingold (1991) is its ancestor; stress
majorization (Gansner et al. 2004) is the distance-faithful alternative we reject in
favor of FA2's cluster aesthetic and animatable incrementality; sfdp/multilevel (Hu 2005)
is the reserve scaling path beyond the ceiling. **The load-bearing risk is the
hairball**: dense small-world graphs collapse into an uninterpretable blob (Nocaj,
Ortmann & Brandes 2014; Simmelian backbones, Nick et al. 2013). The canonical fix —
**backbone extraction** — is already latent in our tiers: lay out and draw on the
high-precision structural backbone (declared + structural), and layer the noisy
temporal/semantic tiers as bundled, DOI-gated, filterable context.

**Encoding theory for typed nodes.** Bertin's retinal variables and Mackinlay/Munzner's
channel-effectiveness ranking prescribe how to assign our several orthogonal attributes
without collision, and ColorBrewer + redundant encoding ground the project's existing
grayscale-safe-by-shape icon rule in theory. Proposed encoding map:

| Attribute | Data type | Channel | Rationale |
|---|---|---|---|
| Graph topology | relational | position (FA2) | most effective channel, spent on the primary message |
| Feature | categorical (many) | hue (colorblind-safe, OKLCH) + set hull | the spatial-region story |
| Document type | categorical (7) | shape (icon mark) + redundant value cue | grayscale-safe, per icon gate |
| Importance / DOI | ordered | size | makes DOI visible |
| Lifecycle / recency | ordered | luminance/value (low-chroma) | per warmth-in-tokens |
| Edge tier | categorical (4) | hue + dash pattern | survives grayscale |

*Bertin 1967/1983; Mackinlay 1986, ACM TOG 5(2); Munzner 2014, Visualization Analysis &
Design; Harrower & Brewer 2003, Cartographic Journal 40(1).*

### Tier 2 — PKM, knowledge-graph & scientific-knowledge mapping

**The central anti-pattern: "beautiful but useless."** The well-documented critique of
the Obsidian/Roam/Logseq global graph view is that it shows *topology but not
task-relevant state* — "it does not show note status, it does not show priorities" — and
degrades from useful (~50 notes) to hairball (~500). The community's fixes *replace* the
global graph rather than improve it: local (focus) graphs, typed/hierarchical links, and
metadata-driven structured views. The empirical KG-practitioner study (Gathani et al.,
arXiv:2304.01311, 2023) confirms node-link diagrams "lack efficacy for KG Consumers" and
recommends knowledge cards, timelines, and domain-specific views. Perret (2022) names the
precondition for usefulness — disciplined, *categorically filtered* linking — which our
typed, provenance-bearing vault already satisfies. Konik (2023) documents the genuine
value the global view *does* have for our exact reviewer needs: **orphan detection**
(an ADR with no downstream plan; a plan with no exec) and **maturity assessment** (dense
cluster = mature; isolated node = underdeveloped). *Code Culture 2024:
https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful;
Perret: https://www.arthurperret.fr/blog/2022-02-13-what-is-the-point-of-a-graph-view.html*

**Lineage-first layout (scientific mapping).** The bibliometric tools whose layout most
resembles our problem do *not* use force-directed equilibrium. CitNetExplorer (van Eck &
Waltman 2014, arXiv:1404.5322) places a *directed* citation network along a chronological
axis with cluster coloring — the closest structural match to our research-ADR-plan-exec
derivation chain. CiteSpace (Chen 2006, JASIST 57(3)) contributes the two most
transferable analytics: **betweenness centrality** rings mark *pivotal turning-point*
documents (the design-reviewer's "load-bearing decision"), and **burst detection** marks
the active research front (the status-reviewer's "what's hot now," mapping onto our
temporal tier). VOSviewer (van Eck & Waltman 2010) contributes the encoding vocabulary
(color = cluster, size = weight, density heatmap = where the mass of work is) and the
**density view** as a clutter-free overview. Connected Papers (2020) contributes the
seed-anchored similarity-neighborhood pattern (recency→color, importance→size,
similarity→edge weight) for the local drill-down.

**Provenance/workflow DAGs — our structural template.** W3C PROV (2013) models provenance
as a DAG of Entity/Activity/Agent with typed derivation edges, conventionally drawn
shape-by-kind, direction-by-derivation, time left-to-right. Our model *is* a provenance
graph (documents = entities, pipeline phases = activities, tiers = typed relations), so
PROV's convention is a ready-made design vocabulary. ML-experiment lineage (MLflow, W&B;
MLflow2PROV) shows the status-review consumption pattern — paint stage/status onto
lineage nodes — that maps onto our plan progress and ADR status. The ADR-tooling
ecosystem (Log4brains, adr-viewer) reveals a *documented blank space exactly where our
product lives*: nobody renders the ADR-to-plan-to-exec decision-DAG well, and the one
universal ADR encoding we must preserve is **status, especially superseded** (a
superseded ADR must read as demoted, never mistaken for live). *https://www.w3.org/TR/prov-dm/*

**Corpus landscape techniques.** ThemeScape contour/peak maps and SOM "maps of science"
render document density as terrain — a strong pure-overview device that suppresses
voluminous exec records into terrain rather than clutter, but discards lineage and
identity, so they are a secondary zoom-out mode at best. UMAP/t-SNE document projections
(Cartolabe 2020 arXiv:2003.00975; Texture 2025 arXiv:2504.16898; Nomic Atlas) are the
natural rendering of our semantic tier; the 2025 *Texture* finding is the key nuance —
embedding projection should be *combined with typed metadata filtering*, not used alone,
which is exactly our type/tier/status filtering thesis.

### Tier 3 — Bleeding-edge (2020–2026)

**Embedding-driven layout (the cheapest high-value experiment).** We already own a
semantic embedding tier, so the whole DR-layout family is unusually cheap for us: project
the existing rag embeddings to 2D with UMAP (McInnes & Healy 2018, arXiv:1802.03426) for a
"semantic constellation" layout that clusters by *meaning* alongside FA2's *connectivity*
layout — CPU-worker, no architecture change. tsNET (Kruiger et al. 2017) proves the
insight but does not scale; **DRGraph** (Zhu et al. 2021, arXiv:2008.07799) is the
scale-hardened version (linear time/memory via sparse distances + negative sampling +
multilevel coarsening, millions of nodes) — the port to consider if the UMAP mode proves
valuable. node2vec/DeepWalk produce *structural* embeddings we largely already encode
explicitly, so they are lower priority.

**Learned / GNN graph drawing — WATCH, do not adopt.** DeepDrawing (2020), DeepGD (2021),
(DNN)² (2021), the Barabási GNN layout accelerator (Nature Comms 2023), and CoRe-GD (ICLR
2024, arXiv:2402.06706) are crossing prototype→emerging and fit our community-structured
data, but they require trained torch models (colliding with the GPU-render-only and
published-wheel-purity constraints) and offer little over FA2 at our bounded node count,
where the GNN speedup (which matters at 10^5–10^6 nodes) is moot. Track CoRe-GD and the
Nature Comms accelerator; revisit only if we ever lay out unbounded slices or a torch-free
inference path appears.

**Summarization & backbone for LOD.** The graph-summarization taxonomy (Liu et al. 2018,
ACM CSUR) is our LOD design vocabulary (feature-collapse = grouping; tier-filter =
simplification). The disparity-filter backbone (Serrano et al. 2009, PNAS, arXiv:0904.2389;
nonparametric inference 2024, arXiv:2409.06417) is a cheap, principled way to thin the
dense low-precision semantic tier so only *significant* similarity edges reach the wire.
AdaMotif (2024, arXiv:2408.16308) offers cluster-as-motif-glyph inspiration for the
constellation LOD. A standalone "GNN-derived node importance for visualization" paper
could not be verified — use classical centrality + backbone filtering instead.

**Scalable rendering & dynamic graphs.** cosmos.gl and Graphistry prove million-node WebGL
rendering but put *layout* on the GPU (which we deliberately reject); adopt their *render*
tricks (instancing, shader culling/LOD), not their layout model. **Embedding Atlas**
(Apple, OSS, VIS 2025, arXiv:2505.06386) and Nomic Atlas are essentially our semantic tier
rendered at scale with automated cluster labeling — the reference implementations to study.
For our temporal tier and live deltas, the dynamic-graph survey (Beck et al. 2017, CGF
36(1)) frames the time-as-animation vs time-as-timeline axis, and the controlled study
(Archambault et al. 2011, IEEE TVCG) gives the operational rule: **animate add/remove**
(animation wins for "what just changed" — our delta case), and **incrementally place new
nodes** to preserve the mental map rather than re-running FA2 (online force-directed,
arXiv:2204.00451). Chronotome (2025, arXiv:2509.01051) is the streaming
semantic-temporal prototype to watch.

**LLM/AI-assisted exploration (the frontier).** Honest read: strong for *querying and
labeling*, still prototype-grade for *visual navigation*. The best-fit pattern is **LinkQ**
(MIT-LL, VIS 2024, arXiv:2406.06621): an LLM turns a natural-language question into a
*well-formed graph query grounded only in ground-truth data*, never inventing nodes — a
perfect fit for our read-and-infer engine + stores-as-sole-wire-client boundary (the LLM
produces query intent; the stores layer executes it; the scene renders the result). The
LLM-as-KG-assistant roadmap (arXiv:2404.01425) supplies the guardrails (semantic-intent
drift, hallucination, prompt brittleness — keep the LLM over ground truth, never a source
of graph facts). GraphRAG surveys (arXiv:2408.08921, arXiv:2501.00309) are
inverse-direction: they *build* a graph from text, which we already have — consume their
G-Retrieval ideas over our existing graph, do not run their construction pipeline. The
safest, highest-value AI feature is **LLM auto-labeling of feature/semantic clusters**
(read-only, grounded, scale-proven by Embedding Atlas).

### Synthesis — adopt / study / watch

**Adopt (fits our architecture and rules):**

- The **DOI stack** (Shneiderman mantra + Furnas DOI + van Ham & Perer search-context-
  expand) as the formal interaction model; DOI *is* the LOD/node-ceiling selection rule.
- **Semantic zoom** as the focus+context mechanism (not distortion).
- **ForceAtlas2** layout with **backbone-extraction-by-tier** as the explicit anti-hairball
  decision: lay out/draw on the high-precision structural backbone, layer noisy tiers as
  bundled, DOI-gated, filterable context.
- **Hierarchical Edge Bundling** for high-volume tier rendering over the compound structure.
- **BubbleSets (v1) → KelpFusion (target)** feature overlays, with **GMap "feature
  countries"** at the overview LOD.
- **Lineage-first layout** (CitNetExplorer / PROV convention): a directed,
  type-shaped, time/derivation-axis DAG is the primary review layout; similarity layouts
  (VOSviewer/Connected-Papers/UMAP) serve the dedicated semantic tier.
- **UMAP semantic-layout mode** over the existing rag embeddings; **disparity-filter
  backbone** edge thinning for the dense semantic tier.
- **Animate-for-deltas + incremental layout** for live updates (mental-map stability).
- **LinkQ-style "talk to your vault"** + **LLM cluster auto-labeling** as grounded,
  read-only AI layers.
- The **encoding map** (type=shape, feature=hue, importance=size, recency=value,
  tier=hue+dash) as the channel-assignment rulebook.

**Study (reference implementations, not wholesale adoption):** Embedding Atlas + Nomic
Atlas (semantic + cluster-label at scale); cosmos.gl (render tricks, reject layout-on-GPU);
DRGraph (scale-hardened DR layout); NodeTrix (the matrix-in-node escalation for dense
clusters).

**Watch (emerging, not ready or not a fit):** GNN learned layout (torch dependency,
no gain at our bound); Chronotome (streaming semantic-temporal); GraphRAG construction;
hyperbolic/distortion browsers (cite for lineage only).

**The highest-leverage insight:** we already own the two things the whole frontier is
trying to obtain — a graph with explicit typed structure *and* a semantic embedding tier.
Most "bleeding-edge" techniques either re-derive structure we already hold or learn a
layout we can get more cheaply. The genuinely additive moves are a UMAP semantic-layout
mode, backbone-filtered edge LOD, animated incremental deltas, and a grounded
LinkQ-style query + cluster-labeling layer. Everything else is watch-and-learn. And the
governing negative lesson from Tier 2 is decisive: a global, unfiltered, untyped
force-directed graph *will* be a beautiful hairball — the product's value comes from
demoting that view in favor of scoped, typed, lineage-aware, status-bearing projections.
