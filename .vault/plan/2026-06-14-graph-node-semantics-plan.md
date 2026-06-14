---
tags:
  - '#plan'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-14'
tier: L2
related:
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-graph-node-semantics-research]]'
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
     Replace graph-node-semantics with a kebab-case feature tag, e.g. #foo-bar.
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

# `graph-node-semantics` plan

### Phase `P01` - authority-class projection

Map every doc_type to its authority register as a query-time projection on the node, additive and read-and-infer.


<!-- One-line headline summary plan. -->

- [ ] `P01.S01` - add an ontology module with an authority_class map from doc_type to register; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P01.S02` - unit-test authority_class across every doc type plus the unknown fallback; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P01.S03` - wire authority_class into the node_view document projection; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P01.S04` - assert authority_class on the document list shape in graph query tests; `engine/crates/engine-query/src/graph.rs`.

### Phase `P02` - type-specific lifecycle vocabulary

Enrich the ingest-time lifecycle parse to carry per-species state (ADR status, plan tier, audit severity, rule active/superseded) with honest degradation.

- [ ] `P02.S05` - parse the ADR H1 status line into a type-specific lifecycle state; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S06` - parse the audit worst-finding severity into a lifecycle max_severity; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S07` - carry the plan tier alongside progress in the lifecycle; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S08` - parse rule active or superseded status into the lifecycle; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S09` - unit-test the type-specific lifecycle parse with honest degradation; `engine/crates/engine-graph/src/index.rs`.

### Phase `P03` - aggregate hint and node_view enrichment

Add the aggregate collapsibility hint and fold the ontology fields onto the document node_view projection.

- [ ] `P03.S10` - add the aggregate collapsibility hint for exec records bound to a parent plan; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P03.S11` - fold authority_class and aggregate onto the node_view projection; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P03.S12` - ensure the id derivation is unchanged by the additive node fields; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P03.S13` - test the enriched node_view carries authority and aggregate additively; `engine/crates/engine-query/src/graph.rs`.

### Phase `P04` - edge derivation-relation label

Project a derivation label onto pipeline edges, distinct from relation and never part of the edge stable key.

- [ ] `P04.S14` - add a derivation-label function from relation, doc_type pair, and provenance; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P04.S15` - read the generated-by label from the exec id container path; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P04.S16` - project edges as values carrying a derivation field distinct from relation; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P04.S17` - prove the derivation label is not part of the edge stable key; `engine/crates/engine-query/src/ontology.rs`.
- [ ] `P04.S18` - test the edge_view derivation labels across the pipeline vocabulary; `engine/crates/engine-query/src/graph.rs`.

### Phase `P05` - rule node species

Introduce the rule node kind projected from the rules tree as authority law with promoted-from edges, without implying rules are vault documents.

- [ ] `P05.S19` - add the rule node kind and its identity prefix; `engine/crates/engine-model/src/id.rs`.
- [ ] `P05.S20` - project rule nodes from the rules tree as authority law with active state; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P05.S21` - mint promoted-from derivation edges from rule back to its audit; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P05.S22` - test rule species projection without implying rules are vault documents; `engine/crates/engine-graph/src/index.rs`.

### Phase `P06` - stores typing, mock parity, conformance

Type the additive wire fields in the stores layer, mirror them byte-for-byte in the mock and fixtures, and prove fidelity through the client path.

- [ ] `P06.S23` - type the additive node and edge ontology fields in the stores engine types; `frontend/src/stores/server/engine.ts`.
- [ ] `P06.S24` - add the ontology fields to the fixture corpus byte-for-byte like live; `frontend/src/testing/fixtures/corpus.ts`.
- [ ] `P06.S25` - serve the additive ontology fields from the mock graph route; `frontend/src/testing/mockEngine.ts`.
- [ ] `P06.S26` - feed a captured live sample through the client path and assert the fields; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `P07` - full green gate and wire-contract verification

Run the full lint gate, the engine suite, and the frontend tests to exit 0, and confirm the additive wire delta is honored end to end.

- [ ] `P07.S27` - run the full lint gate to exit zero across frontend and rust; `engine`.
- [ ] `P07.S28` - run the engine test suite and the relevant frontend vitest suites green; `engine`.
- [ ] `P07.S29` - verify the additive wire delta is honored on success and error envelopes; `engine/tests/tests/conformance.rs`.

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
