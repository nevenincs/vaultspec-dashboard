---
tags:
  - '#plan'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-graph-node-semantics-research]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `graph-node-semantics` plan

### Phase `P01` - authority-class projection

Map every doc_type to its authority register as a query-time projection on the node, additive and read-and-infer.

- [x] `P01.S01` - add an ontology module with an authority_class map from doc_type to register; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P01.S02` - unit-test authority_class across every doc type plus the unknown fallback; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P01.S03` - wire authority_class into the node_view document projection; `engine/crates/engine-query/src/graph.rs`.
- [x] `P01.S04` - assert authority_class on the document list shape in graph query tests; `engine/crates/engine-query/src/graph.rs`.

### Phase `P02` - type-specific lifecycle vocabulary

Enrich the ingest-time lifecycle parse to carry per-species state (ADR status, plan tier, audit severity, rule active/superseded) with honest degradation.

- [x] `P02.S05` - parse the ADR H1 status line into a type-specific lifecycle state; `engine/crates/engine-graph/src/index.rs`.
- [x] `P02.S06` - parse the audit worst-finding severity into a lifecycle max_severity; `engine/crates/engine-graph/src/index.rs`.
- [x] `P02.S07` - carry the plan tier alongside progress in the lifecycle; `engine/crates/engine-graph/src/index.rs`.
- [x] `P02.S08` - parse rule active or superseded status into the lifecycle; `engine/crates/engine-graph/src/index.rs`.
- [x] `P02.S09` - unit-test the type-specific lifecycle parse with honest degradation; `engine/crates/engine-graph/src/index.rs`.

### Phase `P03` - aggregate hint and node_view enrichment

Add the aggregate collapsibility hint and fold the ontology fields onto the document node_view projection.

- [x] `P03.S10` - add the aggregate collapsibility hint for exec records bound to a parent plan; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P03.S11` - fold authority_class and aggregate onto the node_view projection; `engine/crates/engine-query/src/graph.rs`.
- [x] `P03.S12` - ensure the id derivation is unchanged by the additive node fields; `engine/crates/engine-query/src/graph.rs`.
- [x] `P03.S13` - test the enriched node_view carries authority and aggregate additively; `engine/crates/engine-query/src/graph.rs`.

### Phase `P04` - edge derivation-relation label

Project a derivation label onto pipeline edges, distinct from relation and never part of the edge stable key.

- [x] `P04.S14` - add a derivation-label function from relation, doc_type pair, and provenance; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P04.S15` - read the generated-by label from the exec id container path; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P04.S16` - project edges as values carrying a derivation field distinct from relation; `engine/crates/engine-query/src/graph.rs`.
- [x] `P04.S17` - prove the derivation label is not part of the edge stable key; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P04.S18` - test the edge_view derivation labels across the pipeline vocabulary; `engine/crates/engine-query/src/graph.rs`.

### Phase `P05` - rule node species

Introduce the rule node kind projected from the rules tree as authority law with promoted-from edges, without implying rules are vault documents.

- [x] `P05.S19` - add the rule node kind and its identity prefix; `engine/crates/engine-model/src/id.rs`.
- [x] `P05.S20` - project rule nodes from the rules tree as authority law with active state; `engine/crates/engine-graph/src/index.rs`.
- [x] `P05.S21` - mint promoted-from derivation edges from rule back to its audit; `engine/crates/engine-graph/src/index.rs`.
- [x] `P05.S22` - test rule species projection without implying rules are vault documents; `engine/crates/engine-graph/src/index.rs`.

### Phase `P06` - stores typing, mock parity, conformance

Type the additive wire fields in the stores layer, mirror them byte-for-byte in the mock and fixtures, and prove fidelity through the client path.

- [x] `P06.S23` - type the additive node and edge ontology fields in the stores engine types; `frontend/src/stores/server/engine.ts`.
- [x] `P06.S24` - add the ontology fields to the fixture corpus byte-for-byte like live; `frontend/src/testing/fixtures/corpus.ts`.
- [x] `P06.S25` - serve the additive ontology fields from the mock graph route; `frontend/src/testing/mockEngine.ts`.
- [x] `P06.S26` - feed a captured live sample through the client path and assert the fields; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `P07` - full green gate and wire-contract verification

Run the full lint gate, the engine suite, and the frontend tests to exit 0, and confirm the additive wire delta is honored end to end.

- [x] `P07.S27` - run the full lint gate to exit zero across frontend and rust; `engine`.
- [x] `P07.S28` - run the engine test suite and the relevant frontend vitest suites green; `engine`.
- [x] `P07.S29` - verify the additive wire delta is honored on success and error envelopes; `engine/tests/tests/conformance.rs`.

## Description

This plan implements the `graph-node-semantics` ADR: an engine read-and-infer ontology
projection over the `LinkageGraph`, served as additive foundation-reference section-4 wire
fields. It adds a node `authority_class` register enum
(design/roadmap/evidence/judgment/law/substrate/manifest mapped from `doc_type`), a
per-type `lifecycle` vocabulary extension (ADR status, plan tier plus progress, audit
`max_severity`, rule active/superseded, the `generated` flag), and an `aggregate`
collapsibility hint; an edge `derivation` label
(grounds/authorizes/generated-by/aggregates/reviews/promoted-from) read from `related:`
plus the exec id container path, distinct from the section-4 `relation` field and never
part of the edge stable key; and a new `rule` node species projected from the rules tree
as authority class law. Every addition is additive, travels through the shared envelope
helper with the tiers block on success and error, and leaves the id derivation unchanged.
The work is grounded in the ADR, the ontology research, and foundation-reference section 2
(identity) and section 4 (node/edge wire shape).

## Steps

## Parallelization

Phases run in order. P01 (authority class) and P02 (lifecycle vocabulary) touch
independent seams and could overlap, but P03 folds both onto the node_view and so depends
on each. P04 (edge derivation) is independent of P01 through P03 in code but shares the
ontology module, so it follows them to avoid edit churn. P05 (rule species) depends on the
P04 derivation label for its promoted-from edge. P06 (stores, mock, conformance) depends
on every engine field being settled. P07 (the gate) is last by definition.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- `authority_class` appears on every document node_view, mapping each `doc_type` to its
  register, with an honest fallback for an unknown type (P01).
- The per-type lifecycle vocabulary parses ADR status, plan tier, audit `max_severity`,
  and rule active/superseded, degrading honestly when a document predates the convention
  (P02).
- The `aggregate` hint flags exec records as collapsible and the node_view carries the
  additive fields without perturbing the id derivation (P03).
- Each pipeline edge carries a `derivation` label distinct from `relation`, and a test
  proves the label is absent from the edge stable key (P04).
- The `rule` node species projects from the rules tree as authority law with
  `promoted-from` edges, without minting vault documents (P05).
- The stores layer types the additive fields, the mock and fixtures serve them
  byte-for-byte like live, and a captured-live sample asserts them through the client path
  (P06).
- `just dev lint all` exits 0 (eslint, prettier, tsc, cargo fmt, clippy), the engine
  `cargo test` suite is green, the relevant vitest suites are green, and the conformance
  test confirms the additive wire delta on success and error envelopes (P07).
