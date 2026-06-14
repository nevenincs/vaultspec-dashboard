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

Project the vault node ontology - authority class, per-type lifecycle, typed derivation
edges, the aggregate hint, and the new rule species - as additive read-and-infer fields
on the contract section 4 wire shape.

### Phase `P01` - engine ontology model + authority-class map

Extend the engine-model node/edge types with the additive ontology fields and project the fixed doc_type-to-authority-class register; this is the foundation every later Phase builds on.

- [ ] `P01.S01` - add the AuthorityClass enum (design, roadmap, evidence, judgment, law, substrate, manifest) and an additive authority_class field on Node, both serde-derived and defaulted absent; `engine/crates/engine-model/src/lib.rs`.
- [ ] `P01.S02` - add the additive aggregate hint flag on Node (exec records flagged collapsible into their parent plan) without touching the id derivation in id.rs; `engine/crates/engine-model/src/lib.rs`.
- [ ] `P01.S03` - add the DerivationKind enum (grounds, authorizes, generated-by, aggregates, reviews, promoted-from) and an additive optional derivation field on Edge, kept out of the EdgeId stable-key composition; `engine/crates/engine-model/src/lib.rs`.
- [ ] `P01.S04` - add an authority_class_of map from doc_type string to AuthorityClass register and assert with a unit test that every shipped doc_type resolves to exactly one register; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P01.S05` - populate authority_class and the aggregate hint on each document Node at upsert time from doc_type, and add a unit test asserting an adr maps to design and an exec to evidence-aggregate; `engine/crates/engine-graph/src/index.rs`.

### Phase `P02` - per-type lifecycle parse

Parse the type-specific lifecycle vocabulary (ADR status, plan tier, audit max-severity, rule active/superseded, feature in-flight/archived, the generated flag) from frontmatter and body, degrading honestly on unparseable documents.

- [ ] `P02.S06` - parse ADR status (proposed, accepted, rejected, deprecated) from the H1 status line into a per-type lifecycle field, degrading to absent for documents predating the status-line convention; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S07` - parse plan tier (L1 to L4) from frontmatter and surface it on the plan lifecycle alongside the existing checkbox progress, with a unit test over a tier-bearing plan fixture; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S08` - parse audit max_severity (critical, high, medium, low) from finding headings into the audit lifecycle, degrading honestly when no finding heading is present; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P02.S09` - parse feature in_flight versus archived from the facet presence (Archived) into the feature-node lifecycle synthesized at feature granularity; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P02.S10` - surface the generated flag (index docs carrying generated: true) as an additive node field read from frontmatter, with a unit test over a generated index fixture; `engine/crates/engine-graph/src/index.rs`.

### Phase `P03` - typed derivation edges + rule node species

Assign the closed derivation-relation vocabulary as a new additive edge field outside the stable key, and project the new rule node species from the rules tree.

- [ ] `P03.S11` - assign the generated-by derivation label on plan-to-exec edges by reading the exec record id W##/P##/S## container path, the most reliable derivation in the corpus; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P03.S12` - assign the grounds, authorizes, reviews, promoted-from, and aggregates derivation labels from related: provenance by source-and-target doc_type pairing, carried alongside the existing tier never instead of it; `engine/crates/engine-graph/src/index.rs`.
- [ ] `P03.S13` - add a unit test asserting a single declared plan-to-adr edge is simultaneously tier declared and derivation authorizes, and that re-derivation yields the same EdgeId (label never re-keys); `engine/crates/engine-graph/src/index.rs`.
- [ ] `P03.S14` - add the Rule node kind to NodeKind with its canonical key (rules-tree slug) without altering existing kind keys, and project rule nodes of authority class law from the rules tree outside .vault/; `engine/crates/engine-model/src/lib.rs`.
- [ ] `P03.S15` - ingest rule nodes from the rules tree with active/superseded lifecycle and promoted-from edges back to the bearing audit, with a unit test over a rule-plus-audit fixture; `engine/crates/engine-graph/src/index.rs`.

### Phase `P04` - wire amendment through the shared envelope + /filters

Surface the additive node/edge fields on the contract section 4 wire shape through the shared envelope helper with the tiers block preserved, and add the rule kind to the /filters vocabulary.

- [ ] `P04.S16` - extend node_view to serialize authority_class, the per-type lifecycle extension, and the aggregate hint onto the document node view, keeping the thin section 4 fields verbatim; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P04.S17` - serialize the derivation label on the edge wire shape in the graph slice, distinct from the relation field; `engine/crates/engine-query/src/graph.rs`.
- [ ] `P04.S18` - add the rule kind to the /filters node-kinds vocabulary enumerated from the live graph, leaving the relation-type enum and doc_types untouched; `engine/crates/engine-query/src/filter.rs`.
- [ ] `P04.S19` - verify the /graph/query and /filters routes ship the new fields through the shared envelope helper with the tiers block on success and error, adding a route test asserting the envelope wrapping is unchanged; `engine/crates/vaultspec-api/src/routes`.
- [ ] `P04.S20` - add an engine integration test asserting a queried adr node carries authority_class design and a plan-to-exec edge carries derivation generated-by end to end over the live serve path; `engine/tests/src/lib.rs`.

### Phase `P05` - mock-engine parity + captured-live conformance

Make mockEngine serve the new fields byte-for-byte like the live wire and prove it with a captured-live-sample conformance test through the shared client adapter.

- [ ] `P05.S21` - emit authority_class, the per-type lifecycle, the aggregate hint, and the new derivation edge field from the corpus fixture so mock nodes and edges carry the same fields the live wire serves; `frontend/src/testing/fixtures/corpus.ts`.
- [ ] `P05.S22` - serve the new node/edge fields and the rule node kind from the mockEngine graph and filters handlers byte-for-byte like the live serve, including a mock rule node; `frontend/src/testing/mockEngine.ts`.
- [ ] `P05.S23` - add a captured-live-sample conformance test feeding a verbatim live graph slice through adaptGraphSlice and asserting authority_class, the derivation label, and the rule kind survive the same client path the app uses; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `P06` - stores-layer typing + tests

Type the new wire fields in the sole wire client and add adapter/typing tests, keeping scene and chrome dumb.

- [ ] `P06.S24` - extend the EngineNode interface with authority_class, the per-type lifecycle extension, and the aggregate hint, and EngineEdge with the optional derivation field; `frontend/src/stores/server/engine.ts`.
- [ ] `P06.S25` - add the rule kind to the FiltersVocabulary kinds typing and carry the new node/edge fields tolerantly through adaptGraphSlice without forcing scene or chrome to read them; `frontend/src/stores/server/liveAdapters.ts`.
- [ ] `P06.S26` - add stores-layer adapter tests asserting the new node/edge fields and the rule kind round-trip through the wire client and a document-granularity slice still passes through unchanged; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `P07` - full green gate

Run the full lint gate and the engine and frontend test suites to exit 0 as the closing verification.

- [ ] `P07.S27` - run cargo fmt --check, cargo clippy, and the engine test suite to exit 0 across the touched crates; `engine/`.
- [ ] `P07.S28` - run just dev lint all (eslint plus prettier plus tsc plus Rust fmt and clippy) and the frontend vitest suite, confirming exit 0 as the closing green gate; `frontend/`.

## Description

This plan implements the node-ontology ADR: the engine grows a read-and-infer
ontology projection over the `LinkageGraph` that enriches each document node and each
pipeline edge with additive semantics, served as a strictly additive amendment to the
contract section 4 wire shape. The ADR settles the vocabulary; this plan builds the
projection that emits it. Nothing here writes back into `.vault/`, mutates git, or
grows sibling semantics; every property is inferred from frontmatter, document type,
body conventions, the `related:` provenance, and the structural id encoding the engine
already reads.

Five semantic layers land. The authority class is a fixed map from `doc_type` to an
epistemic register (design, roadmap, evidence, judgment, law, substrate, manifest). The
per-type lifecycle extends the existing generic `lifecycle {state, progress}` with
type-shaped state: ADR status from the H1 status line, plan tier alongside the existing
checkbox progress, audit max-severity from finding headings, rule active/superseded,
feature in-flight/archived from facet presence, and the `generated` flag. The typed
derivation label (grounds, authorizes, generated-by, aggregates, reviews, promoted-from)
is a NEW additive edge field carried alongside the existing `relation` and `tier`, NOT
folded into either and NOT part of the edge stable key, so labeling an edge never
re-keys it. The aggregate hint flags exec records as a collapsible species bound to
their parent plan. The new `rule` node species is projected from the rules tree outside
`.vault/` as authority class law with `promoted-from` edges back to its bearing audit.

The parse surface already exists: `doc_type_of`, `doc_lifecycle`, `doc_title`, and
`frontmatter_date` in the engine-graph index, the node construction at upsert in the
same crate, the `node_view`/`feature_nodes` projection in engine-query, and the
`/filters` enumeration. The wire amendment rides the shared envelope helper so the tiers
block is preserved on every response (success and error), and the id derivation in
`id.rs` is untouched. The frontend mirror follows: the mock engine and corpus fixture
serve the new fields byte-for-byte like the live wire, a captured-live-sample test
proves the fold through the same client path the app uses, and the stores layer (the
sole wire client) types the new fields and carries them tolerantly through
`adaptGraphSlice` while scene and chrome stay dumb. The plan is grounded in
`2026-06-14-graph-node-semantics-adr` (the decision), backed by
`2026-06-14-graph-node-semantics-research` (the ontology and empirical counts), and
amends `2026-06-12-dashboard-foundation-reference` section 4 (the wire shape).

## Parallelization

Phases P01 through P03 are engine-internal and carry hard ordering: P01 lands the
additive model types and the authority-class map that P02 and P03 both build on, so P01
must complete before either begins. P02 (per-type lifecycle) and P03 (derivation edges
and the rule species) touch the same index crate and share the P01 foundation; they may
proceed in parallel only if the executor serializes their edits to
`engine/crates/engine-graph/src/index.rs`, otherwise run them in sequence. P04 (the wire
amendment and `/filters`) depends on the full engine model and projection from P01
through P03 and must follow them. P05 (mock parity and conformance) and P06 (stores
typing) both depend on the live wire shape settled in P04 and on each other only at the
shared `liveAdapters.test.ts` file; run P05 before P06 so the captured-live sample
exists for the stores adapter tests to reuse. P07 (the full green gate) is strictly last
and depends on every prior Phase being closed.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following verifiable
checks hold:

- The engine test suite passes: the authority-class map resolves every shipped
  `doc_type` to exactly one register (P01.S04), an ADR node carries `authority_class`
  design and an exec node carries evidence-aggregate (P01.S05), the per-type lifecycle
  fixtures parse correctly (P02.S07, P02.S10), a single declared plan-to-ADR edge is
  simultaneously tier declared and derivation authorizes with a stable EdgeId across
  re-derivation (P03.S13), and the rule-plus-audit fixture projects a law node with a
  promoted-from edge (P03.S15).

- The engine integration test asserts end to end over the live serve path that a queried
  ADR node carries `authority_class` design and a plan-to-exec edge carries derivation
  generated-by (P04.S20), and the route test confirms `/graph/query` and `/filters` ship
  the new fields through the shared envelope helper with the tiers block intact on
  success and error (P04.S19).

- The id derivation is unchanged: no Step touches `engine/crates/engine-model/src/id.rs`,
  and the re-derivation stability test (P03.S13) proves the new edge field stays out of
  the stable key.

- The mock mirrors the live wire: the captured-live-sample conformance test feeds a
  verbatim live graph slice through `adaptGraphSlice` and asserts `authority_class`, the
  derivation label, and the rule kind survive the same client path the app uses
  (P05.S23), and the stores adapter tests assert the new fields round-trip while a
  document-granularity slice still passes through unchanged (P06.S26).

- The full green gate is exit 0: `cargo fmt --check`, `cargo clippy`, and the engine
  tests across the touched crates (P07.S27), and `just dev lint all` (eslint, prettier,
  tsc, Rust fmt and clippy) plus the frontend vitest suite (P07.S28).
