---
tags:
  - '#plan'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-node-salience-research]]'
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace graph-node-salience with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `graph-node-salience` plan

Compute node importance in the engine on CPU as a per-lens Degree-of-Interest projection over the bounded graph, served as a single active-lens `salience` node field behind the shared envelope and tiers block.

## Wave `W01` - Backbone graph and the precomputed lens basis

Deliver the tier-weighted backbone over the bounded subgraph and the per-graph-generation centrality basis (Personalized PageRank with shared partial-vector hubs, Brandes betweenness, k-core coreness, structural-role and aggregated-exec features). This Wave is the CPU foundation every later Wave composes; it is backed by the salience ADR's six-stage pipeline (stages 1-2) and the research's centrality findings. No downstream Wave can compose a score until this basis exists, so it lands first.

### Phase `W01.P01` - Tier-weighted backbone graph

Build the bounded subgraph's adjacency weighted by provenance tier so the declared/structural backbone dominates topology and the dense semantic tier cannot hijack centrality.

- [ ] `W01.P01.S01` - Add a salience module to engine-query exporting the per-lens scalar projection surface and its public types; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P01.S02` - Define the tier-weight vector (declared >= structural >> temporal >= semantic) and build the weighted backbone adjacency over the bounded subgraph from the LinkageGraph; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P01.S03` - Restrict the headline-centrality backbone to the high-precision declared and structural tiers, admitting temporal and semantic only as damped enrichment; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P01.S04` - Unit-test the backbone builder: tier weighting applied, semantic-tier edges damped, bounded-subgraph membership preserved; `engine/crates/engine-query/src/salience.rs`.

### Phase `W01.P02` - The centrality basis precomputed per graph generation

Compute sparse power-iteration Personalized PageRank with shared partial-vector hubs, one Brandes betweenness pass, one k-core peeling, and the structural-role and aggregated-exec features in a single sweep, memoized per graph generation.

- [ ] `W01.P02.S05` - Implement sparse power-iteration PageRank over the weighted backbone with a configurable damping/teleport, returning the stationary distribution; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S06` - Implement the Personalized PageRank partial-vector basis: a shared hub basis combined per biased teleport vector so per-lens vectors are cheap; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S07` - Implement one Brandes betweenness pass over the backbone, returning per-node betweenness under the node ceiling; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S08` - Implement linear-time k-core peeling returning per-node coreness over the backbone; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S09` - Compute the structural-role feature (hub/authority/bridge/leaf) and the aggregated-exec feature (children rolled into the parent plan) reading the semantics aggregate hint, authority_class, and lifecycle fields; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S10` - Assemble the lens-basis struct memoized per graph generation, computing PPR hubs, betweenness, coreness, and role features in one sweep keyed to the immutable graph generation; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W01.P02.S11` - Unit-test the basis: PageRank convergence on a known graph, partial-vector linearity, Brandes betweenness against a hand-computed bridge, coreness peeling of pendant exec leaves; `engine/crates/engine-query/src/salience.rs`.

## Wave `W02` - Rank-normalized DOI composition and the weight-sensitivity sweep

Rank-normalize each criterion within the bounded subgraph and compose the per-lens a-priori importance as a weighted-linear blend, then subtract the focus-distance term to realize the Furnas DOI form. Ship the weight-sensitivity sweep (top-k Kendall-tau stability) as the first-class artifact that turns the lens-derived weights from magic numbers into tested ones. Depends hard on W01's basis vectors; backed by salience ADR stages 3-4 and the research's composition section.

### Phase `W02.P03` - Recency, lifecycle, and the status activity burst

Compute exponential recency with a per-lens half-life, the discrete lifecycle multiplier, and the status-lens activity-burst term over recent temporal-tier edges, kept as separate inputs.

- [ ] `W02.P03.S12` - Implement exponential recency decay exp(-ln2 * age / half_life) reading node modified dates, with the half-life a per-lens parameter; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P03.S13` - Implement the discrete per-lens lifecycle multiplier reading the semantics lifecycle vocabulary, kept distinct from recency so recent-but-archived and old-but-in-flight resolve correctly; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P03.S14` - Implement the status-lens activity-burst term over recent temporal-tier edge activity (new exec records and commit-correlation edges in the recent window); `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P03.S15` - Unit-test recency decay half-life behavior, lifecycle multiplier per state, and the burst term over a windowed temporal edge set; `engine/crates/engine-query/src/salience.rs`.

### Phase `W02.P04` - Rank-normalization and weighted-linear DOI composition

Rank-normalize each criterion to [0,1] within the bounded subgraph and compose the per-lens a-priori importance minus focus-distance into the DOI scalar.

- [ ] `W02.P04.S16` - Implement rank-normalization of each criterion to [0,1] within the bounded served subgraph, robust to the heavy tails of PageRank and betweenness; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P04.S17` - Implement the weighted-linear a-priori composition (type-prior, personalized centrality, recency, lifecycle, structural role) parameterized by a per-lens weight row; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P04.S18` - Subtract the backbone focus-distance term to realize the DOI scalar I(n|L) = API(n|L) - gamma_L * D_backbone(n, focus); `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P04.S19` - Unit-test normalization range and rank stability, weighted composition against a hand-computed blend, and the DOI focus-distance subtraction; `engine/crates/engine-query/src/salience.rs`.

### Phase `W02.P05` - The weight-sensitivity sweep artifact

Produce the top-k Kendall-tau stability sweep under weight perturbation as the artifact that justifies the lens-derived weights.

- [ ] `W02.P05.S20` - Implement the weight-sensitivity sweep computing top-k Kendall-tau stability under +/- weight perturbation per lens; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W02.P05.S21` - Add a sweep test asserting top-k ordering stays stable under bounded perturbation for both launch lenses, failing if a lens top-k flips; `engine/crates/engine-query/src/salience.rs`.

## Wave `W03` - The two launch lenses, focus folding, and the wire amendment

Parameterize the design and status lenses from one model (default status), fold focus into the warm-started PPR on demand, memoize per (graph-generation, lens) and (lens, focus), then amend the wire: the lens request parameter on /graph/query, /graph/asof, /graph/diff, /nodes/{id}/neighbors and the single active-lens salience node field, served through the shared envelope helper with the tiers block, with lens-dependent DOI truncation under MAX_GRAPH_NODES and degraded-tier salience flagged partial. Depends on W02's composition; backed by salience ADR stages 5-6 and the foundation reference section 4.

### Phase `W03.P06` - The two launch lenses parameterized from one model

Define the design and status lenses as teleport-bias and weight-row parameterizations of the one DOI model, with status the default lens.

- [ ] `W03.P06.S22` - Define the Lens enum and per-lens parameter rows (teleport bias, dominant centrality, type-prior weights, recency emphasis, lifecycle modulation) with status as the default; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P06.S23` - Parameterize the design lens: teleport biased to ADR and research authority, PageRank-led with high coreness and low recency weight; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P06.S24` - Parameterize the status lens: teleport biased to in-flight plans, betweenness-and-hub-led with high recency, the activity burst, and exec children aggregated into the parent; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P06.S25` - Unit-test that both lenses derive from one model and yield distinct orderings on the same graph (authority-led vs pivotal-bridge-led); `engine/crates/engine-query/src/salience.rs`.

### Phase `W03.P07` - Focus folding and per-key memoization

Fold focus-bias into the lens teleport vector and re-run the warm-started PPR on demand, memoizing the basis per (graph-generation, lens) and the focus-folded score per (lens, focus).

- [ ] `W03.P07.S26` - Implement focus folding: mix focus-bias into the lens teleport vector and re-run the warm-started PPR so a-priori minus distance is one computation; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P07.S27` - Memoize the lens basis per (graph-generation, lens) and the focus-folded final score per (lens, focus), recomputing only on graph change; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P07.S28` - Unit-test that a no-focus lens switch is a warm-cache hit and a focus change runs exactly one warm-started PPR pass; `engine/crates/engine-query/src/salience.rs`.

### Phase `W03.P08` - The lens wire amendment and DOI-bounded serving

Add the lens request parameter to the four graph endpoints, serve the single active-lens salience node field through the shared envelope helper with the tiers block, make DOI truncation under MAX_GRAPH_NODES lens-and-focus dependent, and flag degraded-tier salience partial.

- [ ] `W03.P08.S29` - Add the lens request parameter to the graph query body and parse it, defaulting to the status lens when omitted; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `W03.P08.S30` - Thread lens through graph_query and attach the single active-lens salience float to each served document node view; `engine/crates/engine-query/src/graph.rs`.
- [ ] `W03.P08.S31` - Make MAX_GRAPH_NODES truncation select the top-DOI nodes for the active lens and focus, keeping the subgraph self-consistent and the truncated block honest; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `W03.P08.S32` - Add the lens parameter to the asof, diff, and neighbors routes, serving salience through the same shared envelope helper with the tiers block; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [ ] `W03.P08.S33` - Flag salience partial via the tiers block when a tier is degraded, computing over available tiers and never presenting a guessed-complete score; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W03.P08.S34` - Amend the foundation reference section 4 prose to document the lens request parameter, the salience node field, and the lens-dependent DOI truncation semantics; `.vault/reference/2026-06-12-dashboard-foundation-reference.md`.
- [ ] `W03.P08.S35` - Add route-level tests asserting lens default, salience presence on nodes, lens-dependent truncation, and the tiers block on success and error envelopes; `engine/crates/vaultspec-api/src/routes/query.rs`.

## Wave `W04` - Stores layer: active-lens state, lens query, and mock parity

Wire the stores layer as the sole wire client: active-lens view state distinct from the tier-dial lens, the lens-parameterized graph query, the focus-change loading state into the scene, and degradation read from the tiers block. Bring the mock engine to live-wire parity for lens and salience and prove it with a captured-live-sample conformance test through the same client path. Depends on W03's wire amendment; backed by the dashboard-layer-ownership and mock-mirrors-live-wire-shape rules.

### Phase `W04.P09` - Active-lens view state and the lens-parameterized query

Hold the active-lens state in the stores view layer, distinct from the tier-dial lens, parameterize the graph query by lens, and drive a focus-change loading state into the scene; read degradation from the tiers block.

- [ ] `W04.P09.S36` - Add an active-salience-lens view store (status default) distinct from the saved-filter-set lenses store, exposing the active lens and a setter; `frontend/src/stores/view/salienceLens.ts`.
- [ ] `W04.P09.S37` - Add the lens parameter to the engine graphQuery adapter request body so the wire client sends the active lens; `frontend/src/stores/server/engine.ts`.
- [ ] `W04.P09.S38` - Parameterize the useGraphSlice query by active lens, keying the query cache on lens so a lens switch is a re-query; `frontend/src/stores/server/queries.ts`.
- [ ] `W04.P09.S39` - Surface a focus-change loading state from the stores layer into the scene loading channel, derived from the lens-and-focus query state; `frontend/src/stores/server/queries.ts`.
- [ ] `W04.P09.S40` - Read salience degradation from the tiers block (fresh error tiers winning over a stale held-success block), never from a bare transport error; `frontend/src/stores/server/queries.ts`.
- [ ] `W04.P09.S41` - Test the active-lens store default and setter, the lens-keyed query re-fetch, the focus loading state, and the tiers-based degradation read; `frontend/src/stores/view/salienceLens.test.ts`.

### Phase `W04.P10` - Mock-engine parity and the live-sample conformance test

Bring the mock engine to live-wire parity for the lens parameter and the salience field, and prove fidelity by feeding a captured live sample through the same client path the app uses.

- [ ] `W04.P10.S42` - Extend the mock engine to honor the lens request parameter and emit the single active-lens salience float on document nodes, byte-for-byte the live wire shape; `frontend/src/testing/mockEngine.ts`.
- [ ] `W04.P10.S43` - Add a conformance test feeding a captured live salience sample through adaptGraphSlice and the same client path the app uses, asserting lens default and salience fidelity; `frontend/src/stores/server/liveAdapters.test.ts`.

## Wave `W05` - Benchmarks, tests, and the closing green gate

Establish the engine benchmark proving Brandes betweenness feasibility under the node ceiling, round out the engine and stores test suites, and run the full lint gate as the closing verification per declaring-green-runs-the-full-gate. Depends on all prior Waves landing; this is the proof-of-feasibility and sign-off Wave.

### Phase `W05.P11` - Betweenness feasibility benchmark and engine tests

Add the engine benchmark proving Brandes betweenness is affordable under the node ceiling and round out the engine-side salience test suite.

- [ ] `W05.P11.S44` - Add an engine benchmark measuring Brandes betweenness and the full basis precompute at the node ceiling, proving feasibility under MAX_GRAPH_NODES; `engine/crates/engine-query/benches/salience_bench.rs`.
- [ ] `W05.P11.S45` - Add an integration test asserting basis memoization survives a no-op query and recomputes on graph generation change; `engine/crates/engine-query/src/salience.rs`.
- [ ] `W05.P11.S46` - Add a degraded-tier integration test asserting salience computed over available tiers is flagged partial in the tiers block end to end; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `W05.P12` - The closing full green gate

Run the full lint and test gate across engine and frontend as the closing verification, confirming exit 0 including prettier and rustfmt.

- [ ] `W05.P12.S47` - Run cargo fmt --check, cargo clippy, and cargo test across the engine workspace and confirm exit 0; `engine/Cargo.toml`.
- [ ] `W05.P12.S48` - Run just dev lint frontend (eslint, prettier, tsc) plus the stores test suite and confirm exit 0 including format:check; `frontend/package.json`.

## Description

This plan implements the engine-side, CPU-bound, per-lens node-salience projection settled by the salience ADR over the bounded vault graph. Today the wire offers only `degree_by_tier`, which measures raw connectivity and inflates a plan by its many execution children while a pivotal ADR with modest degree ranks low. The ADR replaces that with a Furnas Degree-of-Interest field, `interest = a-priori-importance - distance-from-focus`, parameterized by viewer intent (a "lens"): Personalized PageRank with a type-biased teleport vector is the exact implementation of intent-driven importance, with one PageRank engine serving N lenses.

The work follows the ADR's six CPU stages. The engine builds a tier-weighted backbone (declared >= structural >> temporal >= semantic) so the trustworthy backbone dominates topology and the dense semantic tier cannot hijack it; precomputes the lens basis once per graph generation (sparse power-iteration Personalized PageRank with Jeh-Widom shared partial vectors, one Brandes betweenness pass affordable only under the node ceiling, one linear k-core peeling, and the structural-role and aggregated-exec features in one sweep); rank-normalizes each criterion to `[0,1]` within the served subgraph; composes the per-lens a-priori importance as a weighted-linear blend and subtracts the backbone focus-distance term to realize the DOI form; folds focus into the same warm-started PPR on demand; and memoizes and serves a single active-lens `salience` float.

The two launch lenses are concrete parameterizations of one model: the design lens biases the teleport toward ADR and research authority, leads with backbone PageRank and high coreness, and weights recency low; the status lens (the default) biases toward in-flight plans, leads with Brandes betweenness plus the hub score, weights recency high with an activity-burst term, and aggregates exec children into their parent. The salience ADR depends on the accepted node-semantics ADR for the `authority_class`, `lifecycle`, and `aggregate` ontology fields the teleport bias, recency, and fan-out treatment consume. The wire amendment adds a `lens` request parameter to `/graph/query`, `/graph/asof`, `/graph/diff`, and `/nodes/{id}/neighbors` (defaulting to the status lens) and a single active-lens `salience` node field served through the shared envelope helper with the tiers block; because DOI makes the served node set lens-dependent, `MAX_GRAPH_NODES` truncation selects the top-DOI nodes for the active lens and focus, and a salience computed while a tier is degraded is flagged partial via the tiers block. The stores layer is the sole wire client: it owns the active-lens view state (distinct from the canvas tier-dial lens), parameterizes the query by lens, drives a focus-change loading state into the scene, and reads degradation from the tiers block; the mock engine is brought to live-wire parity and proven by a captured-live-sample conformance test. The composition ships a weight-sensitivity sweep (top-k Kendall-tau stability) as the artifact that turns the lens-derived weights from magic numbers into tested ones, and an engine benchmark proves Brandes betweenness feasibility under the ceiling.

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

The five Waves carry hard ordering and are sequenced: W01 (backbone and basis) is the CPU foundation every later Wave composes; W02 (normalization, composition, sweep) consumes the W01 basis vectors; W03 (lenses, focus folding, wire amendment) composes over W02; W04 (stores and mock) consumes the W03 wire shape; W05 (benchmarks and the green gate) follows all prior Waves. No Wave may begin before its predecessor lands.

Within Waves, some Phases parallelize. In W01, P01 (backbone) must land before P02 (the basis runs over the backbone). In W02, P03 (recency, lifecycle, burst) and the normalization half of P04 are independent and may run in parallel, but the composition half of P04 depends on both P03 and P02's centrality outputs, and P05 (the sweep) depends on the composition existing. In W03, P06 (lens parameterization) and P07 (focus folding plus memoization) may proceed in parallel over the W02 composition, while P08 (the wire amendment and DOI-bounded serving) depends on both. In W04, P09 (stores state and query) and P10 (mock parity plus the conformance test) may run in parallel once the W03 wire shape is fixed, though P10's live-sample test is strongest once P09's client path is wired. In W05, the P11 benchmark and integration tests may run in parallel, but P12 (the closing green gate) runs last by definition. Because nearly all engine logic lands in one new `salience` module, the engine Phases that touch it are best executed serially within a Wave to avoid contention even where the dependency graph would permit overlap.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following verifiable criteria hold:

- The salience field is computed in the engine on CPU over the bounded subgraph; no GPU dependency (CUDA, torch, wgpu) enters the engine crates, and no salience compute lives in the scene or chrome layers, satisfying the graph-compute-is-CPU and dashboard-layer-ownership boundaries.
- The PageRank, Brandes betweenness, and k-core unit tests pass against hand-computed reference values on a known graph, and the partial-vector basis test confirms per-lens linearity.
- The composition is rank-normalized within the bounded subgraph and the weight-sensitivity sweep passes: top-k ordering stays stable under bounded weight perturbation for both launch lenses (Kendall-tau above the stability floor), with the sweep shipped as a first-class artifact.
- The two launch lenses derive from one model and yield distinct, defensible orderings on the same graph; the default lens is status.
- The `lens` request parameter is accepted on `/graph/query`, `/graph/asof`, `/graph/diff`, and `/nodes/{id}/neighbors`, defaults to the status lens when omitted, and every response (success and error) carries the single active-lens `salience` node field through the shared envelope helper with the tiers block; route tests assert this.
- `MAX_GRAPH_NODES` truncation selects the top-DOI nodes for the active lens and focus, keeps the returned subgraph self-consistent, and reports honest `truncated` metadata; a salience computed while a tier is degraded is flagged partial via the tiers block, never presented as complete.
- The stores layer is the sole wire client: the active-lens view state is distinct from the tier-dial lens, a lens switch is a re-query, a focus change drives a loading state into the scene, and degradation is read from the tiers block (fresh error tiers winning over stale held success), never from a bare transport error.
- The mock engine mirrors the live wire shape for `lens` and `salience`, and the live-sample conformance test passes through the same client path the app uses.
- The Brandes betweenness benchmark demonstrates feasibility under the node ceiling.
- The full green gate is exit 0: `cargo fmt --check`, `cargo clippy`, and `cargo test` across the engine workspace, and `just dev lint frontend` (eslint, prettier, tsc) plus the stores test suite, per declaring-green-runs-the-full-gate.

Each Phase carries a `<Phase Summary>` and each Step a `<Step Record>`; phase reviews enforce the engine boundaries at every Wave boundary, and required revisions block forward Wave work per review-revision-precedence.
