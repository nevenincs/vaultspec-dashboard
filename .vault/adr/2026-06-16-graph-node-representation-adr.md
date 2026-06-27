---
tags:
  - '#adr'
  - '#graph-node-representation'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-graph-viz-quality-research]]"
  - "[[2026-06-16-graph-viz-scorecard-adr]]"
  - "[[2026-06-16-graph-semantic-embeddings-adr]]"
  - "[[2026-06-16-graph-lineage-dag-adr]]"
  - "[[2026-06-16-code-artifact-nodes-adr]]"
---

# `graph-node-representation` adr: `node representation wire completeness and semantic gate formalization` | (**status:** `proposed`)

## Problem Statement

The six layouts and their scorecard (sibling ADR) are only as honest as the node/edge
representation they consume. The `graph-viz-quality` research surfaced concrete representation
seams that make a layout or its quality score subtly wrong or unship-able: the semantic
"Meaning" mode still ships on a *synthetic* gate while the *real* embedding path is held; the
embedding set is joined to the graph node set only by a fragile DOI-order coincidence rather
than an explicit key; derivation edge labels have holes (and `/graph/lineage` drops the label
entirely), so the lineage DAG loses spine structure; `salience` is served at document
granularity only, so radial-root selection degenerates to 0 on feature nodes; and the Louvain
community partition is never named on the wire. This ADR decides the **representation
completeness** required for the layouts and the scorecard to be honest, and **formalizes the
semantic gate** so "Meaning" can ship on measured real-data quality. It is read-and-infer,
additive to the existing wire contract; it re-decides nothing already owned by the
`graph-semantic-embeddings`, `graph-lineage-dag`, or `code-artifact-nodes` ADRs but closes the
seams they left open.

## Considerations

- **Engine is read-and-infer and CPU.** Every change here is an additive projection or a join
  contract — no vault writes, no GPU compute, no layout coordinates on the wire.
- **The embeddings route already keys by id.** `/graph/embeddings` returns
  `{node_id, vector}` per row; the only gap is that the client joins by *order*, not by
  `node_id`. Closing this is a contract clarification plus an adapter fix, not new engine work.
- **Honest absence over invented data.** Derivation labels that have no real semantic should
  stay `null` (the lineage layout already lays unlabeled nodes out deterministically); we widen
  labeling only where a true derivation relation exists, and we stop *dropping* a label that was
  already computed (the `/graph/lineage` arc bug).
- **Minimal wire growth.** For radial-root robustness we prefer a *client-side* fallback
  (max-degree when salience is absent) over a new wire field, and we keep the community
  partition *client-side* (the scorecard scores `detectCommunities` output directly) rather
  than minting a `community_id` projection the engine would have to own and version.
- **Gate truth comes from `tiers`.** Per `degradation-is-read-from-tiers-not-guessed-from-errors`,
  "Meaning unavailable" must be read from the `tiers` block on the embeddings envelope, not
  inferred from an empty array or a transport error.

## Constraints

- **Parent features.** Depends on `graph-semantic-embeddings` (the `/graph/embeddings` route and
  `runSemanticGateOnRealData`, both shipped), `graph-lineage-dag` (the derivation labeling and
  the timeline arc), and the scorecard ADR (which defines the composite metrics the formalized
  gate uses). All parents are merged on `main`; the scorecard ADR is the only in-flight
  dependency and is sequenced first in the plan.
- **Real embeddings required to ship Meaning.** The formalized gate can only flip to available
  when the *served workspace* is rag-indexed; the dev engine currently serves an unindexed
  workspace, so activation is partly an environment/operational step, not only code. The gate
  must hold honestly (read `tiers`) when embeddings are absent — that is a v1 success state, not
  a failure.
- **No nondeterminism.** The shipping gate verdict must remain reproducible (deterministic
  projection, injectable clock); this forbids adopting a stochastic projector (UMAP/t-SNE)
  inside the gate without pinned seeds — deferred to the scorecard's evidence.
- **Alignment is a contract event.** Changing how embeddings key to nodes touches a seam two
  layers consume; per `provenance-stable-keys-are-identity-bearing` it is a contract amendment,
  not a refactor.

## Implementation

Six additive decisions, all read-and-infer:

**D1 — Embedding↔node join is by `node_id`, contractually.** The client adapter joins the
`/graph/embeddings` rows to graph nodes **by `node_id`**, never by position; the contract
reference is amended to state embeddings are a `node_id`-keyed *subset* (missing vectors are
honest absences). This removes the documented DOI-order coupling and makes the embedding count
independent of node ordering.

**D2 — The semantic gate's shipping verdict is the real-data composite.** `Meaning` becomes
*available* when `runSemanticGateOnRealData` passes the formalized composite from the scorecard
ADR — trustworthiness / `Q_NX` + silhouette + neighborhood-hit + nearest-centroid, each above a
threshold calibrated to the measured 808-vector baseline — **and** the embedding-presence floor
is met, **and** `tiers` reports the search tier available. The synthetic fixture is retained
only as the determinism + time guard. When real embeddings are absent the mode holds (read from
`tiers`), rendered as the designed "Held" state — never as an error.

**D3 — Derivation labeling completeness.** The already-computed `derivation_label` is called in
the `/graph/lineage` arc (closing the hardcoded-`None` drop), so the timeline and lineage DAG
see the same labels as `/graph/query`. The `PlanContainer` / exec-container predicate is widened
to cover the authored plan→wave→phase→step→exec hierarchy; combos with no real derivation
semantics remain honest `null`. Plan-internal `Contains` rides `generated-by` for v1 (a
documented, scorecard-checkable choice via the lineage spine metric).

**D4 — Radial-root robustness without wire growth.** Radial root selection falls back to the
maximum-degree node when `salience` is absent (feature granularity), with the explicit selected
node still overriding. A feature-granularity salience projection is recorded as a deferred wire
follow-up, gated on the scorecard showing the degree fallback is materially worse.

**D5 — Community partition stays client-side.** The Louvain partition is *not* projected onto
the wire; the scorecard scores `detectCommunities` output directly client-side. This honors the
CPU/read-and-infer fence and avoids a new engine projection to own. The decision is revisited
only if a non-scene consumer needs the partition.

**D6 — Linkage coverage is measurable.** "Semantic linkage" completeness (how many nodes carry a
real embedding, how many edges carry a derivation label) is surfaced as a coverage figure the
scorecard reports per slice, so a regression in linkage density is visible, not silent.

## Rationale

Each decision is the minimal additive change that makes a layout or its score honest, chosen to
respect the read-and-infer and CPU fences the research re-confirmed. Joining embeddings by
`node_id` (D1) replaces a coincidence with a contract and is nearly free because the route
already emits the key. Promoting the real-data composite to the shipping verdict (D2) is the
whole point of "activate Meaning": the research showed the synthetic gate is a blind spot and
the real-data path is already implemented and tested — it just is not the verdict. Calling the
existing `derivation_label` in the arc (D3) is a one-line reuse the lineage research already
flagged as a dropped quick-win, and honest nulls beat invented structure. The client-side
fallbacks (D4, D5) keep wire growth out of the picture where a scene-local computation suffices,
consistent with `graph-compute-is-cpu-gpu-is-render-and-search`. Reading availability from
`tiers` (D2) is the consumer-side honesty law already codified. Surfacing linkage coverage (D6)
turns "is the graph richly linked" into a number the scorecard can fence.

## Consequences

- **Gains.** Meaning ships on measured quality instead of a synthetic proxy; the lineage DAG
  regains its spine where labels exist; radial never degenerates to a 0-salience root; the
  embedding seam is a contract, not a coincidence; and linkage richness becomes observable.
- **Honest difficulties.** Activation depends on an operational step (indexing the served
  workspace) outside pure code; the ADR makes the *held* state a correct outcome so the feature
  is not blocked on environment. Widening derivation labeling risks over-labeling — mitigated by
  the lineage spine metric in the scorecard catching both under- and over-labeling.
- **Pathways opened.** A `node_id`-keyed embedding contract makes future per-node semantic
  features (similarity edges, semantic search affordances) straightforward; feature-granularity
  salience and a wire community partition become clean follow-ups if the scorecard ever demands
  them.
- **Pitfalls to avoid.** Guessing "Meaning unavailable" from an empty array instead of `tiers`;
  inventing derivation labels to fill holes; letting the gate ship on the synthetic fixture
  again; growing wire fields the scene could compute itself.

## Codification candidates

- **Rule slug:** `wire-joins-are-keyed-not-ordered`.
  **Rule:** Cross-endpoint joins between engine responses (e.g. `/graph/embeddings` to
  `/graph/query` nodes) are made by an explicit identity key (`node_id`), never by positional/
  DOI ordering coincidence; an absent row is an honest subset omission, and a change to the join
  key is a contract event.

(Holds one full execution cycle before promotion. The semantic-gate-reads-`tiers` discipline is
already covered by `degradation-is-read-from-tiers-not-guessed-from-errors`, so it is not
re-codified here.)
