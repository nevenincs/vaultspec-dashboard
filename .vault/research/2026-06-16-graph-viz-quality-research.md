---
tags:
  - '#research'
  - '#graph-viz-quality'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - '[[2026-06-16-graph-semantic-embeddings-adr]]'
  - '[[2026-06-16-graph-layout-catalog-adr]]'
  - '[[2026-06-16-graph-lineage-dag-adr]]'
  - '[[2026-06-16-graph-force-stability-adr]]'
  - '[[2026-06-16-missing-backend-inventory-research]]'
---



# `graph-viz-quality` research: `graph visualization quality scoring and node representation`

The dashboard graph already ships six layouts — Free (force), Lineage (derivation
DAG), Hierarchy (Sugiyama layered), Radial (concentric tree), Clusters (Louvain
community), Meaning (semantic embedding projection) — each backed by an ADR and merged
to `main` (the `graph-viz-framework` campaign). The Figma `graph/Layout picker`
(node `216:633`, live file `SlhonORmySdoSMTQgDWw3w`) documents the same six. So the open
work is **not** another layout build. It is the question the prior campaign never
answered: **how do we implement node representations and quantitatively score the quality
of the resulting visualizations** — so that "Meaning" can be activated on a principled
gate, the deferred backend can be finished against a measurable target, and any deeper
algorithm rework is driven by evidence rather than taste.

This document grounds that question in the graph-drawing, dimensionality-reduction, and
visualization-validation literature; verifies what scoring and node-representation data
exist in the codebase today; and recommends a single unifying instrument: a deterministic,
bounded, literature-grounded **layout-quality scorecard harness**. That one harness is at
once the verification instrument for the delivered layouts, the CI regression fence
(formalizing the existing semantic gate), and the decision procedure for any rework. The
thesis is **measure first, rework only where the scorecard is poor.**

## Findings

### F1. Validation framing — Munzner's nested model places this work precisely

Munzner's "Nested Model for Visualization Design and Validation" (TVCG 2009; validation
chapter of *Visualization Analysis & Design*, 2014) gives four nested levels — domain/task,
data/operation abstraction, visual-encoding+interaction idiom, and algorithm — where an
upstream error cascades downstream and each level has its own validation method. Our
scoring work lives at exactly the two levels that can be validated **quantitatively and
offline, without a user study**:

- **Algorithm level** — validated by complexity analysis (immediate) and wall-clock /
  memory benchmark (downstream). The engine already does this for the serve path
  (`scale_bench`, `salience_bench`); the layout harness extends it with per-layout
  projection time and peak allocation over a fixed-seed corpus at the node ceiling. The
  `time <= 250ms` half of the existing semantic gate is algorithm-level validation in
  Munzner's exact sense.
- **Encoding level, by surrogate metric** — Munzner admits **quantitative result-image
  metrics** as a downstream encoding-validation method. The graph-drawing-aesthetics
  literature supplies *computable* readability/faithfulness metrics empirically correlated
  with human task performance, so they act as an automated proxy for the lab study. The
  `separation >= 1.2` half of the semantic gate is exactly this: a computed surrogate for
  "do meaning-clusters separate legibly."

**Load-bearing caveat.** Metrics are necessary, not sufficient. "Same Quality Metrics,
Different Graph Drawings" (arXiv 2508.15557) shows identical metric scores can produce
visibly different — sometimes worse — drawings. The scorecard is a **regression fence and
a downstream proxy, not proof of design correctness.** One human design-review checkpoint
per layout stays in the loop.

### F2. Per-family layout metrics — validity is conditional on the layout family

A metric meaningful for force layout can be vacuous (or misleading) for a layered DAG.
Canonical sources: Purchase, "Metrics for Graph Drawing Aesthetics" (JVLC 2002); Ahmed
et al., "(SGD)²" (TVCG 2022, arXiv 2112.01571) for nine implementable normalized loss
forms; Dunne & Shneiderman (HCIL TR 2009-13) for the global/per-node/per-edge metric
decomposition; Meidiana et al., "A Quality Metric for Visualization of Clusters in Graphs"
(GD 2019, arXiv 1908.07792); Reingold & Tilford (IEEE TSE 1981) for tidy trees;
Eiglsperger et al. (GD 2004) for Sugiyama counts. The mapping:

- **Free / force** — the generic suite is fully valid here: **scale-normalized stress**
  (Kamada-Kawai energy / Gansner stress-majorization objective; stress is scale-dependent,
  so normalize the drawing scale before computing — minimize over a uniform scale factor
  first), **neighborhood preservation** (Jaccard of geometric k-NN vs graph adjacency),
  **node-resolution / node-node occlusion**, **edge-length CV**, **crossings**
  (`1 - c/c_max`, `c_max = m(m-1)/2 - sum deg(i)(deg(i)-1)/2`), **crossing angle** (ideal
  ~70 deg per Huang eye-tracking, or 90 deg per SGD²).
- **Lineage DAG + Hierarchy (Sugiyama)** — use **layered-specific** counts, not generic
  angular resolution: total crossings counted **per adjacent-layer pair**, dummy-node /
  bend count (proxy for long edges), total edge length, edge straightness / coordinate
  alignment, and **edge monotonicity** (all edges point one way — downward-violation count).
  For lineage also: layer-assignment correctness against known depth.
- **Radial / tree** — the tidy-tree invariants: node overlap = 0, **subtree disjointness**
  (each subtree occupies a disjoint angular wedge), parent centered over children,
  isomorphic-subtree reproducibility, **wedge/ring uniformity**, depth-to-radius rank
  correlation (Spearman ~1), near-zero crossings (nonzero is a defect signal for a true
  tree).
- **Clusters / Louvain** — the decisive measure is Meidiana et al.: cluster the **drawn
  positions** by k-means *ignoring edges*, then compare that geometric partition to the
  ground-truth Louvain partition with **ARI / AMI / Fowlkes-Mallows / homogeneity /
  completeness** (1 = spatial groups match the partition). Complement with **within-cluster
  compactness** + **between-cluster separation** (silhouette over positions labeled by
  partition) and **modularity Q** (Noack's normalized edge length is provably equivalent to
  modularity).

**Normalize each metric to [0,1], 1 = best**, prefer self-normalizing bounded-ratio forms
(Purchase/greadability) over min-max-against-a-baseline where available. Always **retain
the per-metric vector** alongside any weighted aggregate — SGD²'s criteria-conflict
experiment confirms real trade-offs (vertex resolution vs angular resolution; crossing-angle
vs stress; planarity vs stress), so a flat average hides that you traded stress for
crossings. Keep per-element (node/edge) diagnostic scores (Dunne & Shneiderman) for triage.

### F3. Semantic / "Meaning" projection — formalize the existing gate against the DR literature

For a "nearby = similar" projection, **rank/neighborhood fidelity** is what the user
perceives, so it is the primary metric family. Sources: Venna & Kaski (JMLR 2010) for
trustworthiness & continuity; Lee & Verleysen (Neurocomputing 2009) for the co-ranking
matrix and `Q_NX` / `LCMC`; Espadoto et al. (TVCG 2021) for the quantitative DR survey;
McInnes et al. (UMAP, 2018); "Normalized Stress Is Not Normalized" (arXiv 2408.07724).

- **Local / rank (primary):** **trustworthiness** `T(k)` (penalizes false neighbors the 2D
  map invents) and **continuity** `C(k)` (penalizes true neighbors torn apart); **`Q_NX(K)`**
  the co-k-NN preserved fraction, with **`LCMC(K) = Q_NX(K) - K/(N-1)`** giving a
  *data-driven* choice of `k` via `K_max = argmax LCMC`. PCA tends to be **extrusive** (loses
  local neighbors) — exactly the failure mode to watch.
- **Label-aware (we have feature tags as labels):** **neighborhood hit** `NH(k)`, mean
  **silhouette** on 2D coords by tag, **nearest-centroid accuracy**, and **ARI/NMI** of a
  re-clustered layout vs tags (a stronger "would an unsupervised viewer recover the
  structure" claim).
- **Global honesty (secondary):** **scale-normalized stress** (`SNS = min_alpha NS(X, alpha P)`,
  closed-form optimal alpha) or **Spearman Shepard goodness**.

**The existing gate maps directly onto the literature, which lets us formalize it rather
than invent:** the team's measured `between-spread / within-spread >= 1.2` is an
**un-normalized Calinski-Harabasz ratio** (`SS_B / SS_W` without the `(N-K)/(K-1)` factor) —
adopting proper CH makes the threshold sample-size and cluster-count aware; the
`0.705 own-feature cohesion vs 0.610 nearest-rival` are the `a` and `b` of a **silhouette**;
the `89.3% nearest-centroid = own feature` is **nearest-centroid accuracy**. The principled
upgrade: replace the single ratio with a small composite — `Q_NX(K_max)` + `trustworthiness`
(the rank term the gate currently lacks) + mean silhouette + `NH(10)` + nearest-centroid
accuracy — each threshold **anchored to the measured current-good 808-vector baseline minus
a fixed margin**, turning `1.2` from a magic number into a regression fence.

**PCA vs UMAP/t-SNE is itself decided by these metrics.** PCA preserves global structure and
is deterministic/torch-free; it is adequate when clusters are near-linearly separable in the
top components — which the 89.3% centroid accuracy suggests is *already true* for this corpus.
Nonlinear (UMAP) is warranted only when **`Q_NX`/trustworthiness are low while global stress
is acceptable** — the signature of a curved manifold a linear projection cannot unfold. So the
quality metric is also the decision procedure for whether to invest in UMAP. If UMAP is ever
adopted, determinism requires pinned `random_state`, `init="pca"`, `n_jobs=1`.

### F4. Ground-truth benchmarks — metrics need known-correct targets

To score a metric you need graphs whose correct answer is known by construction, generated
under a fixed seed:

- **Community:** Stochastic Block Model (`networkx.stochastic_block_model`, tune intra/inter
  edge prob) and the **LFR benchmark** (`LFR_benchmark_graph`, power-law degree + community
  sizes, mixing parameter `mu`); recover ground truth from the generator, score with
  **NMI + ARI** vs truth and **modularity Q** internally; the standard plot is metric-vs-`mu`.
  Girvan-Newman 128-node/4-community is the cheap smoke fixture.
- **Hierarchy / radial / lineage:** synthetic random trees / layered DAGs with each node's
  true layer (BFS depth / topological level) recorded; score **layer-assignment correctness**,
  **parent-below-child monotonicity**, and **adjacent-layer crossings vs the planted minimum**.
- **Semantic:** `make_blobs`-style high-D mixtures with known labels (the existing gate's
  `buildGateSlice` already does this deterministically with `Math.sin` centers/jitter, not
  `Math.random`); score trustworthiness/continuity + silhouette/DBI/CH.

**Validate the harness itself** with the gdMetriX / Meidiana pattern: perturb a known-good
layout and assert the scores degrade **monotonically** — proving the metric measures what it
claims before it is trusted to gate.

### F5. Harness engineering — where it lives and how it stays bounded and deterministic

- **Layout-quality scoring runs CLIENT-SIDE.** The engine holds no layout coordinates (it is
  CPU read-and-infer; layout/rendering is the scene layer's job per the
  `graph-compute-is-cpu-gpu-is-render-and-search` rule). Coordinates exist only in the scene
  layout modules, so scoring belongs there — a Vitest gate family mirroring the existing
  `semanticGate.ts` exactly: one gate per layout, each importing the **real** layout module,
  generating a fixed-seed ground-truth graph, running the layout, and scoring. `greadability.js`
  (in-runtime JS, computes crossings/crossing-angle/angular-resolution in [0,1]) is a natural
  in-process oracle; gdMetriX (Python) and OGDF are offline verification oracles.
- **Engine-side keeps only the serve-path benchmark** (`scale_bench`, `#[ignore]`d, reported
  not gated). Do not move layout scoring into the engine — wrong layer, no coordinates,
  read-and-infer fence. (A narrow exception worth weighing: engine-side **modularity Q** of a
  served community partition, if `community_id` is ever put on the wire — see F6.)
- **Bounded-by-default.** Score over the bounded LOD slice / node ceiling (the gate already
  uses 1500); estimate O(N²) stress from a fixed-seed sample of node pairs; restrict
  trustworthiness/`Q_NX` to a fixed small `k` (≈10–20) computing only the K×K co-ranking
  corner (O(N·N log K), not the full N×N matrix); cap every accumulator at creation.
- **Determinism and CI discipline.** Inject `now()` (the gate already does); use a seeded
  PRNG (mulberry32) not `Math.random`; stable index tie-breaking on float ties. **Split the
  time budget from the quality gate** — wall-clock flakes on shared CI runners (this is why
  `scale_bench` is `#[ignore]`d with no time ceiling), so quality metrics (NMI, ARI,
  separation, crossings, silhouette) gate CI while wall-clock is **reported**, not asserted,
  except on a controlled runner.
- **Calibration ≠ gate.** A one-shot, multi-seed, slow calibration script *discovers*
  thresholds with margin and sweeps difficulty (`mu`, `cluster_std`); its committed output is
  the threshold constants + a `METRIC_VERSION`. The CI gate is single-seed, deterministic,
  thresholded. Never let calibration run in CI; never let the gate auto-recalibrate (an
  auto-ratcheting threshold can never catch a regression). A scoring-definition change is a
  **contract event** (version it), mirroring `provenance-stable-keys-are-identity-bearing`.

### F6. Codebase ground-truth — what node representation and scoring exist today

**Node / edge representation on the wire** (`engine-query` `graph.rs`, `salience.rs`,
`embeddings.rs`):

- Nodes carry `id`, `key`, `title`, `doc_type`, `feature_tags`, `kind`, `facets`, `dates`,
  `status`, `tier`, plus query-time projections `degree_by_tier`, `lifecycle`,
  `authority_class`, `aggregate`, and optional `status_value` / `status_class`.
- `salience` is a single rank-normalized float in [0,1], **document granularity only** — feature
  nodes carry none (so radial-root selection defaults to 0 on feature granularity).
- Edges carry `id`, `src`, `dst`, `relation`, `tier`, `confidence`, `state`, `provenance`, plus
  the additive `derivation` label — with **labeling holes**: only the derivation-axis doc-type/
  relation combos are labeled, others are `null`, and plan-internal `Contains` hierarchy rides
  `generated-by` with no sub-label.
- **`community_id` / `cluster_id` are NOT served** — communities are detected client-side in
  `communityLayout.ts` (`detectCommunities` returns `{membership, communities}`), used for the
  optional feature-hull overlay only.
- **Embeddings** are served on a **separate** bounded route `/graph/embeddings`
  (`{node_id, vector: f32[]}`), document-only, with honest absence (vectors omitted, not
  empty), and a documented **alignment open question**: the embedding set matches the
  `/graph/query` node set only by shared DOI ordering — not contractually guaranteed at the
  seam.

**Quality scoring that exists today:**

- `semanticGate.ts` — the one real measured gate: `clusterSeparation` = `betweenAvg/withinAvg`
  on a deterministic synthetic fixture, time budget `<=250ms` over a 1500-node ceiling,
  thresholds `separation >= 1.2` (synthetic) and a real-data variant
  (`runSemanticGateOnRealData`) gated additionally on a `>=0.5` embedding-presence floor. This
  is the template to generalize.
- Per-layout unit tests assert **determinism / golden positions**, **no-NaN** (force), and
  community **separation** + correct clique grouping — genuine (non-tautological) but narrow.
- Rust benches measure **wall-time only** (Brandes betweenness, lens-basis, warm salience),
  no quality, `#[ignore]`d.
- **Absent everywhere:** crossing counts, stress/energy, trustworthiness/continuity,
  silhouette/DBI/CH, modularity, NMI/ARI — none are computed as standalone metrics.

**Natural seams for the harness:** the `representationLayout.ts` dispatcher returns
`{positions, applied, lineageDetail?, downgradeReason?}` — a scorer consumes `positions` (+
`nodes`/`edges` + `lineageDetail` honesty flags); `detectCommunities` already exposes the
partition for modularity/NMI scoring client-side; `semanticGate.ts`'s pattern generalizes to
one `*Gate.ts` per layout.

### F7. Implications for the three in-scope work items

- **Activate "Meaning" live.** The data path is proven against live Qdrant (the campaign saw
  808 real 1024-dim vectors, semantic tier available). What remains: (a) ensure the *served*
  workspace is rag-indexed (the dev engine currently serves an unindexed workspace, which is
  why embeddings come back empty and the gate holds the mode); (b) wire
  `runSemanticGateOnRealData` as the **shipping verdict** instead of the synthetic-only one;
  (c) **formalize** the gate into the F3 composite, calibrated against the 808-vector baseline;
  (d) close the embedding/`/graph/query` **alignment** as an explicit contract rather than a
  DOI-order coincidence.
- **Finish backend deferrals** (already inventoried in `2026-06-16-missing-backend-inventory`):
  git-diff browser is a frontend constant-flip + wiring; `code:` artifact nodes unminted;
  `/graph/lineage` arc still hardcodes `derivation: None`; QueryCore/Timestamp doc-debt;
  optionally put `community_id` on the wire if engine-side modularity scoring is wanted.
- **Deeper algorithm rework is scorecard-driven, not speculative.** Build the scorecard first;
  it tells you *where* rework pays: stress-majorization (SGD²/Gansner) for force only if stress
  is poor; Leiden over Louvain only if modularity/NMI lags (no maintained pure-JS graphology-free
  Leiden exists today — a real cost to weigh); UMAP over PCA only if trustworthiness is low while
  stress is fine. The ADRs already deferred these; the scorecard is the evidence that would
  re-open any of them.

## Recommended path (research outcome)

1. **One ADR for the scorecard harness** — the metric set per layout family (F2/F3), the
   ground-truth generators (F4), client-side placement + bounded/deterministic engineering
   (F5), the calibration-vs-gate split, and `METRIC_VERSION` as a contract event.
2. **One ADR (or amendment) for node-representation wire completeness** — the embedding
   alignment contract, the derivation labeling holes, salience-on-feature-granularity, and
   the `community_id`-on-wire decision; plus the semantic-gate formalization as the shipping
   verdict.
3. **Then a plan** sequencing: harness + calibration first (it is the instrument), then
   Meaning activation measured by it, then the backend deferrals, then any scorecard-justified
   algorithm rework.

## Open questions for the ADR

- Single weighted aggregate per layout, or vector-only scorecard? (Literature favors retaining
  the vector; an aggregate is convenient but hides trade-offs.)
- Do we want **any** engine-side metric (modularity Q on a served partition), or keep all
  scoring client-side to honor the read-and-infer fence strictly?
- Calibration baseline: pin to the current 808-vector dashboard corpus, or a larger fixed
  corpus, so thresholds generalize across workspaces?
- For the deferred non-linear projection: hold UMAP entirely until the scorecard demands it, or
  prototype a deterministic PCA-init UMAP behind the gate now as an option?

## Sources

Graph-drawing metrics: Purchase, "Metrics for Graph Drawing Aesthetics" (JVLC 13(5), 2002);
Ahmed et al., "(SGD)²: Multicriteria Scalable Graph Drawing via Stochastic Gradient Descent"
(IEEE TVCG 2022, arXiv 2112.01571); Dunne & Shneiderman, "Improving Graph Drawing Readability
by Incorporating Readability Metrics" (HCIL TR 2009-13); Mooney et al., "The Multi-Dimensional
Landscape of Graph Drawing Metrics" (2024); Meidiana et al., "A Quality Metric for Visualization
of Clusters in Graphs" (GD 2019, arXiv 1908.07792); Reingold & Tilford, "Tidier Drawings of
Trees" (IEEE TSE 1981); Eiglsperger et al., "An Efficient Implementation of Sugiyama's Algorithm"
(GD 2004); "Same Quality Metrics, Different Graph Drawings" (arXiv 2508.15557); greadability.js
(Gove); gdMetriX (GD 2024); OGDF. Textbooks: Di Battista, Eades, Tamassia & Tollis, *Graph
Drawing* (1999); Kobourov, "Force-Directed Drawing Algorithms" (2013, arXiv 1201.3011); Gansner
et al., "Graph Drawing by Stress Majorization" (GD 2004). DR quality: Venna & Kaski (JMLR 11,
2010); Lee & Verleysen, "Quality assessment of dimensionality reduction: Rank-based criteria"
(Neurocomputing 72, 2009); Espadoto et al., "Toward a Quantitative Survey of Dimension Reduction
Techniques" (IEEE TVCG 27(3), 2021); McInnes et al., "UMAP" (2018, arXiv 1802.03426); van der
Maaten & Hinton, "t-SNE" (JMLR 2008); "Normalized Stress Is Not Normalized" (arXiv 2408.07724);
toolkits pyDRMetrics, ZADU, scikit-learn. Validation: Munzner, "A Nested Model for Visualization
Design and Validation" (IEEE TVCG 15(6), 2009) and *Visualization Analysis & Design* (2014);
Meyer, Sedlmair & Munzner, "The Four-Level Nested Model Revisited" (BELIV). Benchmarks &
reproducibility: Lancichinetti, Fortunato & Radicchi (LFR); Fortunato & Hric, "Community detection
in networks: A user guide"; NetworkX generators; Semmelrock et al., "Reproducibility in
ML-based Research" (arXiv 2406.14325).

## Codebase grounding

Verified on `main`: engine wire `engine/crates/engine-query/src/graph.rs`, `salience.rs`,
`embeddings.rs` (node/edge fields, derivation labeling, separate embeddings route, DOI-order
alignment note); `frontend/src/scene/field/semanticGate.ts` (the one measured gate);
`representationLayout.ts` and the six `*Layout.ts` modules (all present); per-layout `*.test.ts`
(determinism / no-NaN / community separation); `engine/**/benches` (wall-time only). Figma picker
`216:633` in `SlhonORmySdoSMTQgDWw3w`.
