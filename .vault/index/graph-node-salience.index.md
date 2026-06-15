---
generated: true
tags:
  - '#index'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
related:
  - '[[2026-06-14-graph-node-salience-W01-P01-S01]]'
  - '[[2026-06-14-graph-node-salience-W01-P01-S02]]'
  - '[[2026-06-14-graph-node-salience-W01-P01-S03]]'
  - '[[2026-06-14-graph-node-salience-W01-P01-S04]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S05]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S06]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S07]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S08]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S09]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S10]]'
  - '[[2026-06-14-graph-node-salience-W01-P02-S11]]'
  - '[[2026-06-14-graph-node-salience-W02-P03-S12]]'
  - '[[2026-06-14-graph-node-salience-W02-P03-S13]]'
  - '[[2026-06-14-graph-node-salience-W02-P03-S14]]'
  - '[[2026-06-14-graph-node-salience-W02-P03-S15]]'
  - '[[2026-06-14-graph-node-salience-W02-P04-S16]]'
  - '[[2026-06-14-graph-node-salience-W02-P04-S17]]'
  - '[[2026-06-14-graph-node-salience-W02-P04-S18]]'
  - '[[2026-06-14-graph-node-salience-W02-P04-S19]]'
  - '[[2026-06-14-graph-node-salience-W02-P05-S20]]'
  - '[[2026-06-14-graph-node-salience-W02-P05-S21]]'
  - '[[2026-06-14-graph-node-salience-W03-P06-S22]]'
  - '[[2026-06-14-graph-node-salience-W03-P06-S23]]'
  - '[[2026-06-14-graph-node-salience-W03-P06-S24]]'
  - '[[2026-06-14-graph-node-salience-W03-P06-S25]]'
  - '[[2026-06-14-graph-node-salience-W03-P07-S26]]'
  - '[[2026-06-14-graph-node-salience-W03-P07-S27]]'
  - '[[2026-06-14-graph-node-salience-W03-P07-S28]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S29]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S30]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S31]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S32]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S33]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S34]]'
  - '[[2026-06-14-graph-node-salience-W03-P08-S35]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S36]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S37]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S38]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S39]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S40]]'
  - '[[2026-06-14-graph-node-salience-W04-P09-S41]]'
  - '[[2026-06-14-graph-node-salience-W04-P10-S42]]'
  - '[[2026-06-14-graph-node-salience-W04-P10-S43]]'
  - '[[2026-06-14-graph-node-salience-W05-P11-S44]]'
  - '[[2026-06-14-graph-node-salience-W05-P11-S45]]'
  - '[[2026-06-14-graph-node-salience-W05-P11-S46]]'
  - '[[2026-06-14-graph-node-salience-W05-P12-S47]]'
  - '[[2026-06-14-graph-node-salience-W05-P12-S48]]'
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-node-salience-plan]]'
  - '[[2026-06-14-graph-node-salience-research]]'
---

# `graph-node-salience` feature index

Auto-generated index of all documents tagged with `#graph-node-salience`.

## Documents

### adr

- `2026-06-14-graph-node-salience-adr` - `graph-node-salience` adr: `node salience: engine-computed intent-driven importance` | (**status:** `accepted`)

### exec

- `2026-06-14-graph-node-salience-W01-P01-S01` - Add a salience module to engine-query exporting the per-lens scalar projection surface and its public types
- `2026-06-14-graph-node-salience-W01-P01-S02` - Define the tier-weight vector (declared >= structural >> temporal >= semantic) and build the weighted backbone adjacency over the bounded subgraph from the LinkageGraph
- `2026-06-14-graph-node-salience-W01-P01-S03` - Restrict the headline-centrality backbone to the high-precision declared and structural tiers, admitting temporal and semantic only as damped enrichment
- `2026-06-14-graph-node-salience-W01-P01-S04` - Unit-test the backbone builder: tier weighting applied, semantic-tier edges damped, bounded-subgraph membership preserved
- `2026-06-14-graph-node-salience-W01-P02-S05` - Implement sparse power-iteration PageRank over the weighted backbone with a configurable damping/teleport, returning the stationary distribution
- `2026-06-14-graph-node-salience-W01-P02-S06` - Implement the Personalized PageRank partial-vector basis: a shared hub basis combined per biased teleport vector so per-lens vectors are cheap
- `2026-06-14-graph-node-salience-W01-P02-S07` - Implement one Brandes betweenness pass over the backbone, returning per-node betweenness under the node ceiling
- `2026-06-14-graph-node-salience-W01-P02-S08` - Implement linear-time k-core peeling returning per-node coreness over the backbone
- `2026-06-14-graph-node-salience-W01-P02-S09` - Compute the structural-role feature (hub/authority/bridge/leaf) and the aggregated-exec feature (children rolled into the parent plan) reading the semantics aggregate hint, authority_class, and lifecycle fields
- `2026-06-14-graph-node-salience-W01-P02-S10` - Assemble the lens-basis struct memoized per graph generation, computing PPR hubs, betweenness, coreness, and role features in one sweep keyed to the immutable graph generation
- `2026-06-14-graph-node-salience-W01-P02-S11` - Unit-test the basis: PageRank convergence on a known graph, partial-vector linearity, Brandes betweenness against a hand-computed bridge, coreness peeling of pendant exec leaves
- `2026-06-14-graph-node-salience-W02-P03-S12` - Implement exponential recency decay exp(-ln2 * age / half_life) reading node modified dates, with the half-life a per-lens parameter
- `2026-06-14-graph-node-salience-W02-P03-S13` - Implement the discrete per-lens lifecycle multiplier reading the semantics lifecycle vocabulary, kept distinct from recency so recent-but-archived and old-but-in-flight resolve correctly
- `2026-06-14-graph-node-salience-W02-P03-S14` - Implement the status-lens activity-burst term over recent temporal-tier edge activity (new exec records and commit-correlation edges in the recent window)
- `2026-06-14-graph-node-salience-W02-P03-S15` - Unit-test recency decay half-life behavior, lifecycle multiplier per state, and the burst term over a windowed temporal edge set
- `2026-06-14-graph-node-salience-W02-P04-S16` - Implement rank-normalization of each criterion to [0,1] within the bounded served subgraph, robust to the heavy tails of PageRank and betweenness
- `2026-06-14-graph-node-salience-W02-P04-S17` - Implement the weighted-linear a-priori composition (type-prior, personalized centrality, recency, lifecycle, structural role) parameterized by a per-lens weight row
- `2026-06-14-graph-node-salience-W02-P04-S18` - Subtract the backbone focus-distance term to realize the DOI scalar I(n|L) = API(n|L) - gamma_L * D_backbone(n, focus)
- `2026-06-14-graph-node-salience-W02-P04-S19` - Unit-test normalization range and rank stability, weighted composition against a hand-computed blend, and the DOI focus-distance subtraction
- `2026-06-14-graph-node-salience-W02-P05-S20` - Implement the weight-sensitivity sweep computing top-k Kendall-tau stability under +/- weight perturbation per lens
- `2026-06-14-graph-node-salience-W02-P05-S21` - Add a sweep test asserting top-k ordering stays stable under bounded perturbation for both launch lenses, failing if a lens top-k flips
- `2026-06-14-graph-node-salience-W03-P06-S22` - Define the Lens enum and per-lens parameter rows (teleport bias, dominant centrality, type-prior weights, recency emphasis, lifecycle modulation) with status as the default
- `2026-06-14-graph-node-salience-W03-P06-S23` - Parameterize the design lens: teleport biased to ADR and research authority, PageRank-led with high coreness and low recency weight
- `2026-06-14-graph-node-salience-W03-P06-S24` - Parameterize the status lens: teleport biased to in-flight plans, betweenness-and-hub-led with high recency, the activity burst, and exec children aggregated into the parent
- `2026-06-14-graph-node-salience-W03-P06-S25` - Unit-test that both lenses derive from one model and yield distinct orderings on the same graph (authority-led vs pivotal-bridge-led)
- `2026-06-14-graph-node-salience-W03-P07-S26` - Implement focus folding: mix focus-bias into the lens teleport vector and re-run the warm-started PPR so a-priori minus distance is one computation
- `2026-06-14-graph-node-salience-W03-P07-S27` - Memoize the lens basis per (graph-generation, lens) and the focus-folded final score per (lens, focus), recomputing only on graph change
- `2026-06-14-graph-node-salience-W03-P07-S28` - Unit-test that a no-focus lens switch is a warm-cache hit and a focus change runs exactly one warm-started PPR pass
- `2026-06-14-graph-node-salience-W03-P08-S29` - Add the lens request parameter to the graph query body and parse it, defaulting to the status lens when omitted
- `2026-06-14-graph-node-salience-W03-P08-S30` - Thread lens through graph_query and attach the single active-lens salience float to each served document node view
- `2026-06-14-graph-node-salience-W03-P08-S31` - Make MAX_GRAPH_NODES truncation select the top-DOI nodes for the active lens and focus, keeping the subgraph self-consistent and the truncated block honest
- `2026-06-14-graph-node-salience-W03-P08-S32` - Add the lens parameter to the asof, diff, and neighbors routes, serving salience through the same shared envelope helper with the tiers block
- `2026-06-14-graph-node-salience-W03-P08-S33` - Flag salience partial via the tiers block when a tier is degraded, computing over available tiers and never presenting a guessed-complete score
- `2026-06-14-graph-node-salience-W03-P08-S34` - Amend the foundation reference section 4 prose to document the lens request parameter, the salience node field, and the lens-dependent DOI truncation semantics
- `2026-06-14-graph-node-salience-W03-P08-S35` - Add route-level tests asserting lens default, salience presence on nodes, lens-dependent truncation, and the tiers block on success and error envelopes
- `2026-06-14-graph-node-salience-W04-P09-S36` - Add an active-salience-lens view store (status default) distinct from the saved-filter-set lenses store, exposing the active lens and a setter
- `2026-06-14-graph-node-salience-W04-P09-S37` - Add the lens parameter to the engine graphQuery adapter request body so the wire client sends the active lens
- `2026-06-14-graph-node-salience-W04-P09-S38` - Parameterize the useGraphSlice query by active lens, keying the query cache on lens so a lens switch is a re-query
- `2026-06-14-graph-node-salience-W04-P09-S39` - Surface a focus-change loading state from the stores layer into the scene loading channel, derived from the lens-and-focus query state
- `2026-06-14-graph-node-salience-W04-P09-S40` - Read salience degradation from the tiers block (fresh error tiers winning over a stale held-success block), never from a bare transport error
- `2026-06-14-graph-node-salience-W04-P09-S41` - Test the active-lens store default and setter, the lens-keyed query re-fetch, the focus loading state, and the tiers-based degradation read
- `2026-06-14-graph-node-salience-W04-P10-S42` - Extend the mock engine to honor the lens request parameter and emit the single active-lens salience float on document nodes, byte-for-byte the live wire shape
- `2026-06-14-graph-node-salience-W04-P10-S43` - Add a conformance test feeding a captured live salience sample through adaptGraphSlice and the same client path the app uses, asserting lens default and salience fidelity
- `2026-06-14-graph-node-salience-W05-P11-S44` - Add an engine benchmark measuring Brandes betweenness and the full basis precompute at the node ceiling, proving feasibility under MAX_GRAPH_NODES
- `2026-06-14-graph-node-salience-W05-P11-S45` - Add an integration test asserting basis memoization survives a no-op query and recomputes on graph generation change
- `2026-06-14-graph-node-salience-W05-P11-S46` - Add a degraded-tier integration test asserting salience computed over available tiers is flagged partial in the tiers block end to end
- `2026-06-14-graph-node-salience-W05-P12-S47` - Run cargo fmt --check, cargo clippy, and cargo test across the engine workspace and confirm exit 0
- `2026-06-14-graph-node-salience-W05-P12-S48` - Run just dev lint frontend (eslint, prettier, tsc) plus the stores test suite and confirm exit 0 including format:check

### plan

- `2026-06-14-graph-node-salience-plan` - `graph-node-salience` plan

### research

- `2026-06-14-graph-node-salience-research` - `graph-node-salience` research: `node salience: intent-driven importance for the vault graph`
