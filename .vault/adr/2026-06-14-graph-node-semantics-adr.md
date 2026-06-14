---
tags:
  - '#adr'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-node-semantics-research]]"
  - "[[2026-06-14-graph-node-salience-adr]]"
  - "[[2026-06-14-graph-representation-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-node-canvas-adr]]"
---

# `graph-node-semantics` adr: `node semantics: what a vault node represents` | (**status:** `accepted`)

## Problem Statement

The graph is the product, but the node is hollow. The wire contract (foundation reference
§4) gives every node only a thin, intent-blind identity: `id, kind, doc_type?,
feature_tags[], title, dates{created,modified}, lifecycle{state, progress?{done,total}},
degree_by_tier{declared,structural,temporal,semantic}`. That is enough to *place and
connect* a node but not enough to say what it *means*. The dashboard visualizes a
spec-driven second brain whose whole value is that document **type carries epistemic
weight** — an ADR is a binding design decision, a plan is a trackable roadmap that spawns
work, an execution record is one low-individual-value proof-of-work in a long tail, an
audit is a graded verdict, a rule is standing law. The internal ontology grounding counted
this vault on 2026-06-14: ~232 execution records against 26 ADRs and 14 plans — a corpus
where treating all nodes as equal weight means the documents that matter least dominate the
field. Yet `doc_type` is an opaque enum, `lifecycle.state` is a single generic string that
cannot tell an ADR's `deprecated` from a plan's `complete` from an audit's open findings,
and the pipeline-derivation relations (an ADR *binds* a plan, a plan *generates* execution,
an audit *reviews* exec, a rule is *promoted-from* an audit) are invisible — buried in
unlabeled `related:` edges and not distinguishable from the four engine inference tiers.

This ADR settles the **node ontology**: what each node species represents, the
type-specific lifecycle vocabulary each carries, the typed derivation relations between
them, and the aggregate-versus-individual weighting that keeps the exec long tail from
swamping the field. It is the semantic foundation the salience ADR ranks over and the
representation ADR encodes. It is spec work — it pins what a node *is* and what the engine
must project; it writes no code and changes no wire envelope shape beyond naming the
additive fields.

## Considerations

The ontology is an **inference projection over sources the engine already reads**, not new
authored data. The engine parses frontmatter, document type, plan check-state, and
`related:` edges today; every property below is derivable from those sources plus the
pipeline structure described in the framework rules — so the ontology honors read-and-infer
by construction (it reads `.vault/` and infers; it never writes back).

Five semantic layers are missing from the thin node and are added here:

- **Authority class.** Each document type belongs to an authority register that names *what
  kind of question it answers*: ADR and (secondarily) reference/research are **design
  authority** ("why is the system this way"); plan is **roadmap authority** ("what is being
  built, how far along"); execution records are **evidence** ("was this step done, did
  anything go wrong"); audit is **judgment** ("is the work sound"); rule is **law** ("what
  binds going forward"); index is a generated **manifest**, not authored knowledge. The
  authority class is the stable handle the salience lenses bias toward.
- **Type-specific lifecycle vocabulary.** A single `state` string is a lossy collapse. Each
  species has its own state machine and must surface its own: ADR `proposed | accepted |
  rejected | deprecated` (deprecated = superseded), plan `tier (L1–L4)` plus
  `progress{done,total}`, audit `max-severity (critical|high|medium|low)` and open/closed
  verdict, rule `active | superseded`, feature `in-flight | archived`, and the `generated`
  flag separating derived index nodes from authored ones.
- **Typed derivation relations.** The pipeline edges — `authorizes`/`binds` (ADR→plan),
  `generated-by` (plan→exec, the strongest structural edge: the record's id encodes the
  plan container path), `aggregates` (exec→summary), `reviews` (plan/exec→audit),
  `promoted-from` (audit→rule), `grounds` (research/reference→adr) — are first-class
  *labeled* relations, **distinct from the four inference tiers**. The tiers say *how the
  engine knows two documents are related* (declared/structural/temporal/semantic); the
  derivation relations say *what the relationship is in the framework*. Both are needed.
- **Two orthogonal edge families.** The graph carries the *pipeline-derivation chain*
  (research→adr→plan→exec→audit→rule) and, crossing it, the *feature-membership star*
  (everything sharing `#{feature}`). A node belongs to both; the ontology names both so a
  view can lean on either.
- **Aggregate-versus-individual weight hint.** The node carries a hint that exec records
  are an aggregate species — collapsible into their parent plan as "N records, M complete"
  at overview LOD — while ADRs/plans are individually weighted. This is the ontological
  fact the representation LOD and the salience fan-out treatment both consume.

The thin §4 fields are retained verbatim; the ontology is *additive*. A new `rule` node
species is introduced (rules live in `.vaultspec/rules/`, outside `.vault/`, and have no
`kind` today) so the codify pipeline's output is representable.

## Constraints

- **Read-and-infer only.** Every ontological property is inferred from frontmatter, type,
  structure, and `related:` edges. The engine must never write the ontology back into
  documents, mint vault state, or grow sibling semantics; an unparseable or unknown
  document type is surfaced as a data state, never silently coerced.
- **The shared envelope and the tiers block are inviolable.** The enriched node ships
  through the API layer's shared envelope helper and every response — success and error —
  still carries the per-tier degradation block. The ontology adds node fields; it does not
  add a hand-built response path.
- **One model, additive fields — not a new node shape that diverges from the contract.**
  The ontology extends the §4 node; it does not fork it. Any change to a stable-key
  composition (the provenance fields that bear node/edge identity) remains a contract event
  between engine and consumers, not a refactor — adding ontology fields must not perturb the
  id derivation.
- **Stores is the sole wire client.** The scene and chrome consume the ontology only
  through the stores layer; no view fetches it, and no view reads the raw tiers block to
  derive it. The derivation-relation labels and authority class arrive as node/edge fields,
  not as something a view computes from raw degree.
- **Frontier caution.** The ontology must not over-specify states the framework does not
  actually carry. The vocabulary is pinned to the *shipped* templates and rules (verified
  against the live templates in the grounding research); a template that later adds a state
  is a contract amendment, not a silent widening.

## Implementation

The engine grows an **ontology projection** over the `LinkageGraph`: a derived, fully
re-computable enrichment of each node and each derivation edge, served as additive fields
on the §4 node and as a relation label on the pipeline edges. It layers, from the document
outward: the **authority class** (a fixed map from `doc_type` to register —
design-authority, roadmap-authority, evidence, judgment, law, substrate, manifest); the
**type-specific lifecycle** (parsed from frontmatter and body — ADR H1 status, plan tier +
checkbox aggregate, audit worst-finding severity, rule active/superseded, feature
in-flight/archived, the generated flag); and the **aggregate hint** (exec records flagged
as a collapsible species bound to their parent plan).

Edges gain a **derivation-relation label** drawn from the closed vocabulary (`grounds`,
`authorizes`/`binds`, `generated-by`, `aggregates`, `reviews`, `promoted-from`), assigned
by reading the `related:` provenance and the structural id encoding (the `generated-by`
plan→exec edge is read directly from the record id's `W##/P##/S##` container path, the most
reliable edge in the corpus). This label is carried *alongside*, never instead of, the
existing tier on the edge: a single declared wiki-link from a plan to its ADR is
simultaneously `tier: declared` and `relation: authorizes`.

The **feature** becomes a first-class lifecycle-bearing entity in the constellation, not a
bare tag: a feature node carries its in-flight/archived state and the aggregate shape of its
members (counts by type, plan progress rolled up), which is what the constellation LOD draws
as a "feature country." The new **rule** species is projected from the rules tree as a node
of authority class *law* with `active|superseded` state and `promoted-from` edges back into
the audit that bore it.

Consumption is layered cleanly: the **salience ADR** ranks over the authority class,
lifecycle, and aggregate hint to compute the per-lens importance field; the
**representation ADR** maps authority class and type to shape, lifecycle to the
value/ring/badge channels, and derivation relations to the lineage layout and edge
treatment. This ADR defines the vocabulary; the siblings consume it. No application code is
written here.

## Rationale

The ontology is the missing middle between a connected graph and a *legible* one. The
representation research is blunt about the failure mode: the Obsidian/Roam "beautiful but
useless" critique is precisely a graph that renders topology while hiding type and status —
and the documented community fix is to encode type and status, which is only possible if the
model carries them. The W3C PROV convention (type→shape, direction→derivation,
time→position) is a ready-made, standardized vocabulary for exactly our entity/activity/
derivation shape, and the ADR-tooling survey found a documented blank space where our
product lives — nobody renders the ADR→plan→exec decision-DAG with provenance well. The
semantics grounding established empirically why this matters here: with ~72% of authored
documents being execution records, an intent-blind node guarantees the field is dominated by
the least important species. Authority class is the handle that lets the salience ADR
implement "importance depends on viewer intent" as a teleport bias (design lens → design
authority; status lens → roadmap authority), and the typed derivation relations are what let
a lineage layout exist at all. Keeping the ontology a re-computable inference projection
(never written back) preserves the read-and-infer engine boundary that makes the engine a
swappable backbone, and keeping it additive over the §4 node preserves the
one-model/projection discipline so the scene and chrome stay dumb views.

## Consequences

- **Gains.** The node stops lying by omission: a viewer (and the salience lens, and the
  renderer) can finally distinguish a binding accepted ADR from a deprecated one, an
  in-flight plan from a complete one, a pivotal audit from a clean one, and a single
  exec record from the aggregate it belongs to. The typed derivation relations make a
  lineage view and a decision-DAG view possible; the authority class makes intent-driven
  ranking possible; the aggregate hint makes the exec long tail collapsible instead of
  overwhelming. All of it is re-derivable and deletable, costing the engine no authored
  state.
- **Costs and difficulties.** The lifecycle parse is per-type and must track the shipped
  templates faithfully; a template change is now a contract touch-point. Severity and ADR
  status are parsed from body conventions (H1 status line, finding headings), which is more
  fragile than frontmatter and must degrade honestly when a document predates the
  convention. The new `rule` species crosses the `.vault/`/rules-tree boundary and must be
  projected without implying rules are vault documents.
- **Risks.** Over-specifying states the framework does not carry would bake fiction into the
  wire; the vocabulary must stay pinned to shipped reality. Conflating the derivation
  relation with the inference tier would collapse two genuinely different facts — the
  ontology must keep them orthogonal. If the aggregate hint is ignored by a consumer, the
  exec tail re-swamps the field, so the representation and salience ADRs must both honor it.
- **Pathways opened.** A typed, authority-bearing node makes every downstream view cheaper:
  the salience lenses, the lineage/decision-DAG layout, the "superseded reads as faded"
  treatment, and a future audit/compliance lens all become parameterizations over one
  shared vocabulary rather than bespoke per-view logic.

## Codification candidates

- **Rule slug:** `node-ontology-is-inferred-not-authored`.
  **Rule:** Every ontological node/edge property (authority class, type-specific lifecycle,
  derivation-relation label, aggregate hint) is a re-computable engine projection inferred
  from frontmatter, structure, and `related:` edges — never written back into `.vault/`
  documents and never authored by hand. (Candidate only; must hold across a full execution
  cycle before promotion, per the codify discipline.)
- **Rule slug:** `derivation-relations-are-orthogonal-to-inference-tiers`.
  **Rule:** A pipeline-derivation relation label (`authorizes`, `generated-by`, `reviews`,
  `promoted-from`, `grounds`, `aggregates`) is carried alongside, never instead of, the
  edge's provenance tier; the two name different facts and must never be collapsed.
  (Candidate only; pending a cycle of use.)
