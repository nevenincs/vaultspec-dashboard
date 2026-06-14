---
tags:
  - '#adr'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-node-salience-research]]"
  - "[[2026-06-14-graph-node-semantics-adr]]"
  - "[[2026-06-14-graph-representation-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
---

# `graph-node-salience` adr: `node salience: engine-computed intent-driven importance` | (**status:** `accepted`)

## Problem Statement

Not every node matters equally, and which ones matter depends on who is looking. A reviewer
auditing design decisions cares about ADRs and the research behind them; a reviewer checking
project status cares about plans, their progress, and what is in-flight; a forensic reviewer
chasing a regression suddenly cares about one specific execution record's incident notes.
The node-semantics ADR establishes that the corpus is sharply asymmetric — ~232 execution
records against 26 ADRs and 14 plans in this vault — and that document type carries an
authority class. What is still missing is the **mechanism that turns that asymmetry into a
visible ranking**, and the recognition that the ranking is not one number but a *family* of
numbers parameterized by viewer intent. Today the wire offers `degree_by_tier`, which
measures raw connectivity — and raw connectivity is exactly the wrong signal here, because a
plan's degree is inflated by its many execution children while a pivotal ADR with modest
degree is the load-bearing decision a whole feature converges on.

This ADR settles **node salience**: an engine-computed, per-viewer-intent ("lens")
importance scalar served as a node field, composing document-type priors, graph centrality,
recency, lifecycle, and structural role over the bounded graph. It is the backend decision
of this campaign — importance is computed on CPU in the engine as a projection over the one
model, not re-derived in the GUI from the thin node. It is spec work: it pins the model and
where it runs; it writes no code.

## Considerations

The governing formalism is Furnas's **Degree-of-Interest**: `interest = a-priori-importance
− distance-from-focus`. Every signal we have is a candidate for one of those two slots, and
— the key realization from the salience research — a "lens" is a *parameterization* of that
one model, not a separate code path. The decisive algorithmic finding is that **Personalized
PageRank with a type-biased teleport vector is the exact implementation of intent-driven
importance**: biasing the random surfer's restart distribution toward a document type makes
the surfer spend its time on that type and what that type endorses. One PageRank engine, N
teleport vectors, N lenses.

The HITS hub/authority duality explains *why* the lens split is real on this graph: **ADRs
and research are authorities** (pointed to by good hubs — the plans that implement them, the
references and audits that cite them), while **plans are hubs** (they point outward densely,
spawning execution and binding an ADR; their value is what they assemble). So the design
lens wants authorities and the status lens wants hubs, and the *same graph* yields two
orderings. **Betweenness centrality** (affordable via Brandes' algorithm under the node
ceiling) identifies the pivotal load-bearing bridges a status reviewer most needs, and
**coreness** (k-core) gives a fan-out-robust embeddedness signal — pendant exec leaves peel
in the first round and cannot inflate a plan's coreness, directly defusing the hub problem.

Two design hazards are confronted head-on. First, the **hub/fan-out problem**: a plan must
not be made important merely by counting its children, nor swamped by them. The mitigations
are layered — coreness over degree, *aggregating* exec children into the parent as one
evidential signal (consuming the semantics ADR's aggregate hint), normalizing centrality
within type, and separating hub (out) from authority (in). Second, the **magic-numbers
problem**: a composite scalar must not rest on arbitrary weights. The answer is that the
weights are *derived from the lens definition itself* (the design lens is authority-dominant
by construction, not by tuning), each criterion is rank-normalized within the bounded
subgraph before combining, and the composition ships with a **weight-sensitivity sweep**
(top-k Kendall-τ stability under ±perturbation) as the artifact that turns the weights from
magic numbers into tested ones. A weighted linear combination is chosen over learning-to-
rank and TOPSIS for v1 because it is transparent, interpretable (the engine must be able to
*explain* a node's score), CPU-cheap, and our criteria are largely aligned and additive.

## Constraints

- **Graph compute is CPU, in the engine.** Centrality, normalization, and composition run on
  the CPU over the engine's in-memory adjacency — never on the GPU and never in the scene
  layer. This is the standing graph-compute-is-CPU boundary; the salience field is a graph
  computation, so it belongs in the engine.
- **Bounded by default.** Every measure is computed over the bounded served subgraph under
  the existing node ceiling. Betweenness in particular is affordable *only* because of
  Brandes' algorithm and the ceiling; an unbounded salience computation is forbidden for the
  same reason an unbounded graph read is.
- **Read-and-infer, fully re-derivable.** The salience field is a derived projection,
  memoized per `(graph-generation, lens)` and recomputed on graph change; it persists only
  in the engine-owned cache, is deletable, and is never written back into documents.
- **Served through the shared envelope, with the tiers block.** The wire carries a **single
  `salience` float computed for the *requested* lens** — not a per-lens map — because DOI makes
  the served node set itself lens-dependent (see the wire-contract amendment in Implementation);
  it ships as an additive node field through the shared envelope helper. A degraded tier (e.g.
  the semantic tier absent) yields a salience computed on the available tiers, flagged partial
  via the tiers block, never a guessed or silently complete score. Degradation is read from
  tiers, not inferred from a transport error.
- **A projection over one model; the stores layer is the sole consumer.** Salience is one
  more projection over the `LinkageGraph`, surfaced by a stores query; the scene and chrome
  read it as a node field and never compute it. No new endpoint defines its own node shape.
- **Depends on the node-semantics ontology.** The lens teleport vectors bias toward authority
  class, recency reads the type-specific lifecycle, and the fan-out treatment consumes the
  aggregate hint — all defined by the sibling semantics ADR, which is accepted and stable.

## Implementation

The engine grows a **salience projection**: a per-lens scalar field over the bounded graph,
computed in six CPU stages. (1) **Build the weighted backbone graph** — the bounded
subgraph's adjacency with each edge weighted by its provenance tier (declared ≥ structural ≫
temporal ≥ semantic), so the trustworthy declared/structural backbone dominates the topology
and the dense, noisy semantic tier cannot hijack it. (2) **Precompute the lens basis once per
graph generation** — sparse power-iteration Personalized PageRank for each lens's biased
teleport vector (partial vectors share a hub basis so lenses are cheap), one Brandes
betweenness pass on the backbone, one linear k-core peeling, and the structural-role
(hub/authority/bridge/leaf) and aggregated-exec features in one sweep. (3) **Rank-normalize**
each criterion to `[0,1]` within the served subgraph (robust to the heavy tails of PageRank
and betweenness). (4) **Compose** the per-lens a-priori importance as a weighted linear blend
of type-prior, personalized centrality, recency, lifecycle multiplier, and structural role,
then subtract the focus-distance term to realize the DOI form. (5) **Fold focus into the same
computation** — when the user selects a focus node, mix focus-bias into the lens teleport
vector and re-run the warm-started PPR, so `a-priori − distance` is one computation, not two.
(6) **Memoize and serve** the scalar as an additive per-lens node field.

The two launch lenses are concrete parameterizations of this one model. The **design lens**
biases the teleport toward design-authority nodes (ADR + research), leads with backbone
PageRank (authority) and high coreness, and weights recency low (decisions are durable, so an
old accepted ADR still ranks; an archived ADR is damped here but not zeroed). The **status
lens** biases toward in-flight plans, leads with backbone betweenness (the pivotal bridges
that gate work) plus the hub score, weights recency *high* with an activity-burst term over
recent execution/commit-correlation edges, and aggregates exec children into their parent so
volume reads as evidence, not inflation. A future **audit/compliance lens** is just a third
teleport vector biased to audit + rule with its own weight row — no new architecture, which
is the whole point of making the lens a parameter.

Recency is an **exponential decay** with a per-lens half-life (the single interpretable knob),
kept distinct from the discrete lifecycle multiplier so "recent but archived" and "old but
in-flight" are both handled correctly. The composition ships its **weight-sensitivity sweep**
as a first-class artifact. All of this is engine-side and CPU-bound; the GUI consumes the
per-lens scalar through the stores layer and the representation ADR maps it to node size and
label priority. No application code is written in this ADR.

## Rationale

The salience research makes the case that this is a *settled* science problem, not an
invention: Personalized/Topic-Sensitive PageRank is the textbook mechanism for biasing
importance toward a preference set, and biasing toward a document *type* is the direct
realization of "importance depends on intent." HITS supplies the structural argument that
ADRs-as-authorities and plans-as-hubs is a real property of this graph rather than a
stipulation, so the two lenses are reading something true. Betweenness via Brandes is the one
measure that names *pivotal* documents — CiteSpace uses exactly this to surface turning-point
papers — and it is the status reviewer's "what gates other work." Computing the headline
centrality on the high-precision declared/structural backbone mirrors the project's own
identity discipline (declared/structural is identity-bearing; temporal/semantic is
re-derivable enrichment) and keeps the ranking defensible against embedding noise. Placing the
whole computation in the engine on CPU is not merely rule-compliance: centrality is branchy,
pointer-chasing graph work that the GPU serves poorly, and putting it in the engine keeps the
GUI a dumb projection so a swapped backbone or a third view inherits salience for free. The
weighted-linear-plus-sensitivity-sweep choice answers the magic-numbers objection honestly —
the weights come from the lens definitions and are shown to be robust — without the opacity of
a learned ranker we have no labels to train yet.

## Consequences

- **Gains.** "Importance depends on viewer intent" becomes a parameter, not a special case:
  one DOI/PPR engine serves every lens, adding a lens is adding a teleport vector and a weight
  row, and the field is a clean projection the scene renders as size and label priority. The
  hub/fan-out and magic-numbers hazards are met with named, tested mitigations. The exec long
  tail recedes by aggregation; the pivotal ADR rises by authority; the in-flight plan rises by
  betweenness and recency — each for a defensible reason.
- **Costs and difficulties.** Betweenness is the most expensive measure even via Brandes, and
  its feasibility leans entirely on the node ceiling; a future demand for salience over a
  larger slice forces an approximation (sampled betweenness) rather than a bigger exact
  computation. The per-lens weights, though lens-derived, still require the sensitivity sweep
  to be authored and maintained as the corpus shape shifts. Personalized PageRank's partial-
  vector sharing is an optimization that must be implemented carefully to actually make lenses
  cheap.
- **Risks.** Mis-weighting the tiers would let the dense semantic tier dominate the backbone
  and corrupt every lens — the backbone-on-high-precision-tiers decision is load-bearing and
  must not regress. If a consumer ignores the aggregate hint, exec volume re-floods the field.
  Treating salience as a fixed single number anywhere downstream would silently discard the
  intent dimension that justifies the whole ADR. A salience computed while a tier is degraded
  must be surfaced as such, never presented as a complete ranking.
- **Pathways opened.** A per-lens importance field is the substrate for DOI-driven LOD (serve
  the top-salience N nodes for the active lens and focus), for size/label encoding, for
  search-result ranking, and for future lenses (audit, author, feature-owner) at near-zero
  marginal architecture. It also gives the representation ADR a principled answer to "which
  nodes survive into the bounded view."

## Codification candidates

- **Rule slug:** `salience-is-a-per-lens-engine-projection`.
  **Rule:** Node importance is computed in the engine on CPU as a per-lens (viewer-intent)
  scalar projection over the bounded graph and served as a node field; it is never a single
  fixed number, never re-derived in the GUI from the thin node, and never computed on the GPU.
  (Candidate only; must hold across a full execution cycle before promotion.)
- **Rule slug:** `centrality-runs-on-the-high-precision-backbone`.
  **Rule:** Headline graph centrality (PageRank, betweenness, coreness) is computed on the
  tier-weighted backbone with declared/structural dominating; temporal/semantic enter only as
  damped enrichment, so importance is defensible against low-precision edge noise.
  (Candidate only; pending a cycle of use.)
