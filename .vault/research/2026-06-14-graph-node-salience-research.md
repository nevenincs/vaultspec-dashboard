---
tags:
  - '#research'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-representation-research]]"
  - "[[2026-06-14-graph-node-semantics-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `graph-node-salience` research: `node salience: intent-driven importance for the vault graph`

This is the data-science grounding for an engine-side, per-lens node-importance
projection over the vault graph. Nodes are typed documents (research, reference, ADR,
plan, execution-record, audit, rule); edges carry the four provenance tiers (declared
wiki-links, structural code-references, temporal commit-correlations, semantic
rag-similarity). The governing requirement, set by the product: **importance is not a
single fixed scalar — it depends on the viewer's intent (a "lens").** A status reviewer
weights plans (in-flight progress, what is moving); a design reviewer weights ADRs and the
research behind them; execution records are individually low-value but collectively
evidential. Importance is computed on CPU, engine-side, over the bounded graph, and served
as a per-lens node scalar field — consistent with the standing rules that graph compute
stays CPU-bound, queries are bounded by default, the engine is read-and-infer, and views
are projections of one model. The unifying formalism throughout is Furnas's
Degree-of-Interest: `interest = a-priori-importance − distance-from-focus`; every
centrality, type-prior, recency term, and tier weight is a candidate for one of those two
slots, and a lens is a parameterization of that one model.

## Findings

### Centrality measures and what each means to a reviewer

- **Degree / weighted degree** — cheapest, purely local connectivity. Include only as a
  base signal and the substrate for the hub/fan-out treatment; raw out-degree is exactly
  what lets a plan be inflated by its many exec children, so degree must be made
  role-aware and tier-weighted before entering the composite.
- **Eigenvector centrality** (Bonacich 1972) — importance flows from important neighbors;
  the right *idea* but ill-behaved on directed near-acyclic citation graphs. Use its
  damped descendant, PageRank.
- **Katz centrality** (Katz 1953, Psychometrika 18(1)) — eigenvector with walk
  attenuation α and baseline β; the formal bridge to PageRank, whose damping/teleport are
  the production form.
- **PageRank** (Page, Brin, Motwani & Winograd 1999, Stanford InfoLab) — stationary
  distribution of a damped random surfer; reads as *earned, transitive authority*. Adopt
  as the default backbone authority measure, computed on the high-precision tiers. CPU-
  cheap (sparse power iteration, O(edges)/iteration, tens of iterations on a bounded
  graph) and — decisively — personalizable. *http://ilpubs.stanford.edu:8090/422/*
- **Personalized / Topic-Sensitive PageRank** (Haveliwala 2002, WWW '02; Jeh & Widom 2003,
  WWW '03) — **the core finding.** Replace the uniform teleport with a *biased* restart
  distribution: **a lens is a teleport vector biased toward a document type (and recency
  band).** Design lens = teleport onto ADR + research; status lens = teleport onto plans
  (optionally in-flight only). Jeh & Widom's partial-vector decomposition lets per-lens
  PPR share a precomputed basis (linear combination at serve time), so lenses are cheap.
  This is the formal implementation of "importance depends on intent": one PPR engine, N
  teleport vectors, N lenses. *https://dl.acm.org/doi/10.1145/511446.511513*
- **HITS hubs vs authorities** (Kleinberg 1999, JACM 46(5)) — the conceptual heart of the
  lens split. **ADRs and research are authorities** (pointed to by good hubs: plans that
  implement them, references that cite them, audits that check against them). **Plans are
  hubs** (they point outward densely — spawning exec records, binding an ADR, referencing
  research; their value is what they assemble). So the design lens wants authorities and
  the status lens wants hubs — the same graph yields two orderings. Adopt HITS as the
  conceptual model; prefer PPR as the production engine (global/stable vs HITS's
  query-subgraph drift) with HITS hub/authority as an optional explanatory label.
- **Betweenness centrality** (Freeman 1977; Brandes 2001, J. Math. Sociology 25(2)) — the
  fraction of shortest paths through a node; reads as *pivotal load-bearing bridge*. An
  ADR between its justifying research and all implementing plans is a structural bottleneck
  — a load-bearing decision. Brandes' O(nm) algorithm is what makes it affordable on a
  bounded CPU graph (naïve all-pairs is O(n³)). Adopt, weighted heavily in the **status
  lens** (the pivotal in-flight bridges that gate other work).
  *https://snap.stanford.edu/class/cs224w-readings/brandes01centrality.pdf*
- **k-core / coreness** (Seidman 1983, Social Networks 5(3)) — largest k whose core
  contains the node; linear-time iterative pruning. Marks documents embedded in a densely-
  interlinked feature cluster vs peripheral one-offs, and is **robust to fan-out**:
  pendant exec leaves are peeled in the first round, so they cannot inflate a plan's
  coreness. Adopt as a cheap embeddedness prior and structural-role feature.

### The hub / fan-out problem

A plan spawns many exec records; two failure modes — inflation (out-degree makes it look
maximally important) and swamping (its PageRank mass drains into leaves, or the volume of
low-value exec nodes dilutes the field). Five complementary mitigations, in order:

1. **Coreness over degree** — pendant leaves peel first; the most direct structural fix.
2. **Aggregate children into the parent** — treat the exec fan-out as one evidential
   signal on the plan ("N records, M complete"), not N competing nodes; the children get a
   low type-prior and recede unless individually focused. This is the cleanest reconcilia-
   tion of "voluminous but individually low-value."
3. **Normalize centrality within type** (z-score or rank within {plans}, {ADRs}, …) so a
   plan does not outrank an ADR merely because plans fan out more.
4. **Separate out-degree (hub) from in-degree (authority)** so fan-out feeds the hub score
   without contaminating authority.
5. **Structural-role discovery** (RolX — Henderson et al. 2012, KDD) — adopt the *idea*
   (role ≠ community ≠ raw centrality) as an explicit `structural-role` feature
   (hub/authority/bridge/leaf) computed from the cheap measures above; full unsupervised
   RolX is likely over-engineered because our nodes already carry semantic types.

### Multi-criteria composition without magic numbers

- **Combination form:** ship a **weighted linear combination** over normalized criteria —
  transparent, debuggable, monotonic, CPU-cheap, and interpretable (an engine that serves
  a per-node scalar must be able to *explain* it). Reserve learning-to-rank (Liu 2009) for
  later, once interaction logs (which lens, which node expanded) provide implicit relevance
  labels. The "magic numbers" objection is answered not by premature L2R but by (a)
  deriving weights from the *lens definition itself* (the design lens is "authority-
  dominant" by construction, not by tuning) and (b) a sensitivity sweep.
- **Normalization is the real source of ad-hocness** — PageRank is a heavy-tailed
  probability, betweenness an unbounded count, recency a [0,1] decay, coreness a small
  integer; combining raw values is meaningless. **Rank/quantile-normalize each measure to
  [0,1] within the bounded served subgraph** (robust to PageRank/betweenness heavy tails),
  or z-score within type for type-relative comparisons.
- **Weight robustness:** a defensible composite must show the ranking is not fragile —
  perturb each weight ±20–50% and confirm top-k per lens is stable (Kendall's τ between
  perturbed orderings). If top-k flips under small perturbation the lens is ill-defined.
  This discipline replaces magic numbers with justified, tested numbers.
- **TOPSIS / MCDA** (Hwang & Yoon 1981) — the principled multi-criteria option, but *not*
  for v1: our criteria are largely aligned and additive (authority, recency, embeddedness
  push the same way), the output must be a continuous scalar (not just an ordering), and
  interpretability/CPU-cost favor the linear score. Cite as the road not taken.

### Lens formalization: Degree-of-Interest as the unifying frame

Furnas's `DOI(node | focus) = API(node) − D(node, focus)` gives the exact shape. **API**
(a-priori importance) is the lens-parameterized blend of type-prior, personalized
centrality, recency, and structural role — the intrinsic per-lens importance even with no
focus. **D** is graph distance from the user's focus, also lens-aware (measured along the
high-precision backbone). **Personalized PageRank unifies both terms in one computation:**
type-biased teleport implements the lens API; focus-biased teleport implements DOI distance
(closeness-under-restart *is* a soft graph distance — Jeh & Widom). So PPR with a teleport
vector = (type-bias mixed with focus-bias) is literally `API − distance`. Status and design
lenses are then the *same* machinery with different parameters:

| Parameter | Design lens | Status lens |
|---|---|---|
| PPR teleport bias (API authority) | ADR + research | plans (in-flight) |
| Dominant centrality | PageRank / authority | betweenness (pivotal) + hub score |
| Type-prior weights | ADR, research, reference high | plan high; exec aggregated |
| Recency emphasis | low–moderate (decisions durable) | **high** (freshness is the point) |
| Lifecycle modulation | archived ADRs still matter | archived plans heavily damped |

Adding a third lens ("audit/compliance" → bias to audit + rule) is just another teleport
vector and weight row — no new architecture, matching the views-are-projections discipline.

### Recency / temporal weighting

Use **exponential decay** for freshness — `recency(t) = exp(−λ·age)`, `λ = ln(2)/half_life`
— because its single knob (half-life: "loses half its freshness every H days") is directly
interpretable, and it is smooth and memoryless. Keep recency (continuous age) and
**lifecycle state** (discrete: draft / in-flight / complete / archived) as *separate*
inputs so "recent but archived" and "old but in-flight" are both handled: lifecycle is a
per-lens multiplier (in-flight strongly boosts the status lens; archived heavily damps it
but must not zero a still-authoritative archived ADR in the design lens). Add a status-lens
**burst term** weighting *recent edge activity* (new exec records, new commit-correlation
edges in the last window) — "what moved this week" is edge-recency on the temporal tier,
distinct from node age.

### Edge-tier weighting and the backbone

The four tiers differ sharply in precision: declared wiki-links (highest, intentional) ≥
structural code-refs (high, mechanical) ≫ temporal commit-correlations (medium,
correlation ≠ provenance) ≥ semantic rag-similarity (lowest, dense, soft). Every centrality
runs over a *weighted* graph with the tier as edge weight; unweighted centrality would let
the dense low-precision semantic tier dominate the topology. **Strong recommendation:
compute the authoritative "backbone" centrality (PageRank, betweenness, coreness) on the
high-precision declared+structural tiers only, and admit temporal/semantic as damped
secondary enrichment** (a tier-weight vector with declared ≥ structural ≫ temporal ≥
semantic, itself under the sensitivity discipline). Distance-from-focus should likewise
traverse the backbone, so "context" is asserted provenance, not embedding drift. This
mirrors the project's identity discipline (declared/structural is identity-bearing;
temporal/semantic is re-derivable) and degradation-honesty posture.

### Proposed composition

For a node `n` under lens `L`, served over the bounded subgraph `G_b`:

```
I(n | L) = API(n | L) − γ_L · D_backbone(n, focus)            [DOI form]

API(n | L) =  α_L · TypePrior_L(type(n))
            + β_L · PersonalizedCentrality_L(n)        // PPR teleport-biased to L's types,
                                                       // on backbone tiers; status lens
                                                       // blends in Brandes betweenness
            + δ_L · Recency(n)                          // exp(−ln2·age / H_L)
            + ε_L · LifecycleMult_L(state(n))
            + ζ_L · StructuralRole(n)                   // coreness + hub/authority/bridge/leaf

weights {α,β,δ,ε,ζ,γ}_L derived from the lens definition, not tuned ad hoc;
validated by a ±weight sensitivity sweep on top-k stability;
each criterion rank-normalized to [0,1] within G_b before combining.
```

**Which centrality powers which lens.** Design lens → backbone PageRank biased to
ADR+research (authority — "the load-bearing decisions and the research behind them"),
low recency weight, high coreness. Status lens → backbone betweenness (Brandes) + hub
score, PPR biased to in-flight plans, **high** recency + activity burst, exec children
aggregated into the parent ("what's in-flight, pivotal, and moving now"). A future audit
lens → bias to audit+rule.

**Engine-side CPU computation over the bounded graph.** (1) Build the weighted backbone
graph for the bounded subgraph (tier-weighted `HashMap` adjacency — the existing CPU
representation, no GPU). (2) Precompute lens basis vectors once per graph generation:
sparse power-iteration PPR per biased teleport vector (Jeh–Widom partial vectors share a
hub basis), Brandes betweenness once on the backbone (affordable only because of Brandes +
the node ceiling), k-core peeling once (linear), structural-role + aggregated-exec features
in one pass. (3) Rank-normalize each criterion within the subgraph. (4) Compose `I(n | L)`
as the weighted linear blend; memoize per `(graph-generation, lens)`; recompute only on
graph change; serve as a per-lens node scalar field — a projection over the one model,
never a per-view fetch. (5) Focus interaction: fold focus-bias into the lens teleport
vector and re-run the warm-started PPR (or subtract a precomputed backbone-distance term).
(6) Ship the weight-sensitivity sweep as the artifact that turns the weights from magic
numbers into justified, tested parameters.

The result is a defensible, intent-driven importance field: **one Degree-of-Interest
model, realized as tier-weighted Personalized PageRank plus Brandes betweenness on the
high-precision backbone, composed with type-prior, exponential recency, lifecycle, and
coreness/role — re-parameterized per lens, computed on CPU over the bounded graph, served
as a per-lens node scalar.**
