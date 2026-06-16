---
tags:
  - '#adr'
  - '#graph-viz-scorecard'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-graph-viz-quality-research]]"
  - "[[2026-06-16-graph-node-representation-adr]]"
  - "[[2026-06-16-graph-semantic-embeddings-adr]]"
  - "[[2026-06-16-graph-layout-catalog-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace graph-viz-scorecard with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `graph-viz-scorecard` adr: `graph visualization quality scorecard harness` | (**status:** `proposed`)

## Problem Statement

The dashboard ships six graph layouts — Free (force), Lineage (derivation DAG), Hierarchy
(Sugiyama), Radial (concentric tree), Clusters (Louvain), Meaning (semantic projection) —
but has no way to **quantify whether any of them is good**. The only measured quality signal
in the codebase is one cluster-separation ratio inside `semanticGate.ts`; everything else is
asserted by eye or by determinism-only unit tests. Without a quality instrument we cannot:
honestly gate "Meaning" on real data, regression-test a layout change, or decide *whether*
deeper algorithm rework (stress-majorization, Leiden, UMAP) is even warranted. This ADR
decides the architecture of a single **layout-quality scorecard harness** that answers
"how good is this drawing, against a known-correct target, reproducibly" — and makes that
the standing instrument for verification, CI regression, and rework decisions. It is the
direct outcome of the `graph-viz-quality` research.

## Considerations

- **Validation framing.** Munzner's nested model places automated layout scoring at the
  *algorithm* level (wall-clock, already covered by the engine `scale_bench`) and as a
  computable *encoding-level surrogate* for a user study. The graph-drawing-aesthetics and
  dimensionality-reduction literatures supply metrics empirically correlated with human task
  performance; we adopt them as that surrogate. The harness validates *delivered* layouts —
  it does not replace design judgment.
- **Metric validity is family-conditional.** A metric meaningful for a force layout is
  vacuous for a layered DAG. The harness therefore carries a *different metric set per layout
  family*, not one universal score.
- **The existing gate is already a named metric.** The research showed the current
  `between/within >= 1.2` separation is an un-normalized Calinski-Harabasz ratio, the
  `0.705 vs 0.610` cohesion numbers are silhouette `a`/`b`, and `89.3%` is nearest-centroid
  accuracy. We *formalize* rather than invent, and we keep `semanticGate.ts` as the template.
- **Where coordinates live.** Layout coordinates exist only in the scene layer
  (`frontend/src/scene/field/`); the engine holds none. Scoring must run where the
  coordinates are.
- **Libraries.** `greadability.js` computes crossings / crossing-angle / angular-resolution
  in [0,1] in-runtime (no extra process); `gdMetriX` (Python/NetworkX) and `OGDF` are offline
  verification oracles; `scikit-learn` / `pyDRMetrics` / `ZADU` supply the DR and clustering
  metrics for offline calibration. We reuse these rather than reimplement, and port only a
  minimal deterministic subset into the in-process gate.

## Constraints

- **CPU / read-and-infer fence.** Per `graph-compute-is-cpu-gpu-is-render-and-search` and
  `engine-read-and-infer`, the engine has no layout coordinates and must grow no layout-scoring
  semantics. This is the load-bearing constraint that fixes the harness *client-side*.
- **Bounded-by-default.** Per `bounded-by-default-for-every-accumulator`, several metrics are
  naively O(N^2) (stress, co-ranking). They must be bounded at the call site: node ceiling,
  fixed-seed pair sampling, fixed small `k` neighborhoods, capped accumulators.
- **Determinism for CI.** Any metric that gates CI must be byte-reproducible: injectable
  clock, seeded PRNG (not `Math.random`), stable index tie-breaking. Wall-clock is *not*
  reproducible on shared runners, so it cannot be a hard CI assertion.
- **No mature Rust GD-metrics crate** exists; this reinforces the client-side (JS) placement,
  where `greadability.js` already runs.
- **Parent-feature stability.** The six layout modules and `semanticGate.ts` are shipped and
  stable on `main`; the harness consumes their existing outputs (`positions`, the
  `detectCommunities` partition, `lineageDetail` honesty flags) and adds no new dependency on
  in-flight work. The one soft dependency is real embeddings for the Meaning metrics, owned by
  the sibling node-representation ADR.

## Implementation

The harness is a **client-side Vitest gate family** in `frontend/src/scene/field/`, one
`*Gate.ts` per layout, generalizing the existing `semanticGate.ts` shape: import the *real*
layout module, generate a fixed-seed ground-truth graph, run the layout, score the output,
compare each metric to a calibrated threshold with margin. Four layers:

**1. Ground-truth generators (deterministic fixtures).** Seeded TS generators whose correct
answer is known by construction — Stochastic Block Model and an LFR-style benchmark for
community (ground-truth partition recoverable), synthetic layered trees / DAGs with each
node's true layer recorded for hierarchy/radial/lineage, and `make_blobs`-style high-D
mixtures with known labels for semantic (the existing `buildGateSlice` is the seed of this).
A seeded PRNG (mulberry32) replaces any `Math.random`.

**2. Per-family metric set (each normalized to [0,1], 1 = best).**
- *Free / force* — scale-normalized stress, neighborhood preservation (Jaccard of geometric
  k-NN vs graph adjacency), node-resolution / overlap, edge-length CV, crossings
  (`1 - c/c_max`) and crossing angle (via `greadability.js`).
- *Lineage + Hierarchy (Sugiyama)* — per-adjacent-layer crossing count, dummy-node / bend
  count, total edge length, edge monotonicity (downward-violation count), and layer-assignment
  correctness against the planted layer.
- *Radial / tree* — node overlap = 0, subtree disjointness, wedge / ring uniformity,
  depth-to-radius Spearman, crossing count (≈ 0 for a true tree).
- *Clusters / Louvain* — Meidiana geometric-partition score (k-means the drawn positions,
  compare to the Louvain partition by ARI / AMI), within-cluster compactness, between-cluster
  silhouette, and modularity Q of the partition.
- *Meaning / semantic* — trustworthiness and continuity, `Q_NX(K_max)` with `K_max` from
  LCMC, neighborhood hit `NH(k)`, mean silhouette by tag, nearest-centroid accuracy, and a
  global-honesty term (scale-normalized stress or Spearman Shepard goodness).

**3. Scorecard output, not a single number.** Each gate emits a **vector** of named metric
values plus their thresholds, margins, pass/fail, seed, and a `METRIC_VERSION`. A per-family
weighted aggregate may be *reported* for at-a-glance reading, but **CI gates on the individual
metric thresholds, never on the aggregate** — the literature is explicit that a flat average
hides real metric trade-offs.

**4. Calibration vs gate split.** A separate one-shot, multi-seed **calibration script**
sweeps difficulty (SBM `p/q`, LFR `mu`, blob `cluster_std`), measures the *current shipping*
layout, and emits the threshold constants (current-good minus a fixed margin) committed
alongside `METRIC_VERSION`. The CI gate is single-seed, deterministic, and thresholded.
Wall-clock budgets (the `<=250ms` half of the semantic gate) are *reported*, not asserted on
shared CI; they may hard-gate only on a controlled runner, mirroring the `#[ignore]`d engine
benches. The engine side gains nothing new — its serve-path `scale_bench` remains the only
engine benchmark.

The harness is validated against itself with the perturb-a-known-good-layout test: jitter a
correct layout and assert every metric degrades **monotonically**, proving the metric measures
what it claims before it is trusted to gate.

## Rationale

This architecture follows directly from the research. Client-side placement is forced by the
CPU/read-and-infer fence (the engine has no coordinates) and is *cheap* because
`greadability.js` already runs in-runtime and `semanticGate.ts` already proves the
import-real-module-and-score pattern works as a test. Per-family metric sets come from the
graph-drawing literature (Purchase 2002; Ahmed et al. SGD^2 2022; Meidiana et al. GD 2019;
Reingold-Tilford 1981; Eiglsperger et al. GD 2004) and the DR literature (Venna & Kaski 2010;
Lee & Verleysen 2009; Espadoto et al. 2021), each chosen for the property its layout *claims*
to deliver. Retaining the metric vector and gating per-metric is the SGD^2 criteria-conflict
finding made operational. The calibration-vs-gate split and determinism discipline are
standard ML reproducibility practice and match the existing gate's injectable clock and
deterministic fixture. Formalizing rather than inventing thresholds — anchoring to the measured
808-vector baseline — is what turns the present `1.2` heuristic into a defensible regression
fence.

## Consequences

- **Gains.** A single instrument that (a) *verifies* the six delivered layouts against
  known-correct targets, (b) becomes a CI *regression fence* so a layout change cannot silently
  worsen readability, and (c) is the *evidence* that re-opens any deferred algorithm decision —
  rework becomes scorecard-driven, not speculative. It also upgrades the semantic gate from a
  single ratio to a literature-backed composite.
- **Honest difficulties.** Metric implementations are subtle (scale-normalized stress, the
  co-ranking corner, per-layer crossing counting); getting them right is the bulk of the work,
  and a wrong metric gives false confidence. The perturbation self-test mitigates but does not
  eliminate this. Thresholds anchored to *today's* layout bake in today's quality as the floor —
  acceptable as a regression fence, but not an absolute readability guarantee (the "Same Quality
  Metrics, Different Graph Drawings" caveat stands: keep one human design checkpoint).
- **Pathways opened.** Once the scorecard exists, Meaning can ship on a principled gate, Leiden
  vs Louvain / UMAP vs PCA / stress-majorization become measurable A/Bs, and any future layout
  inherits a ready-made quality bar.
- **Pitfalls to avoid.** Letting the gate auto-recalibrate (it could never catch a regression);
  gating on the aggregate (hides trade-offs); hard-gating wall-clock on shared CI (flake);
  scoring drift from an unversioned metric definition.

## Codification candidates

- **Rule slug:** `layout-quality-is-scored-client-side-and-bounded`.
  **Rule:** Every graph-layout quality metric is computed client-side over the bounded LOD
  slice (the engine serves no coordinates and grows no scoring semantics), with each O(N^2)
  metric bounded at its call site (node ceiling, fixed-seed sampling, fixed-k), and gated on
  per-metric thresholds — never an aggregate.
- **Rule slug:** `quality-gates-are-deterministic-calibration-is-separate`.
  **Rule:** A CI quality gate is single-seed deterministic and thresholded against a committed
  calibration baseline plus margin; calibration is a separate one-shot multi-seed pass, the
  gate never auto-recalibrates, and a metric-definition change bumps `METRIC_VERSION` as a
  contract event. Wall-clock is reported, not hard-gated on shared runners.

(Both hold one full execution cycle before promotion, per the codify discipline.)
