---
tags:
  - '#research'
  - '#index-node-exclusion'
date: '2026-06-20'
modified: '2026-06-20'
related:
  - '[[2026-06-20-terminology-standardization-adr]]'
  - '[[2026-06-20-terminology-standardization-research]]'
---

# `index-node-exclusion` research: `Eliminate .vault/index doc-type from the engine and dashboard`

The `.vault/index/` documents are auto-generated feature indexes (the
`<Feature Index>` artifacts, tagged `#index`, managed only by
`vaultspec-core vault feature index`). They are metanodes: roll-up manifests of a
feature's documents, never authored knowledge. The directive for this campaign is
absolute — index documents must NEVER be served, categorized, graphed, timelined,
or treated as a feature, in either the engine or the dashboard. They are a
strictly-ignored element.

The prior `terminology-standardization` ADR (D5) settled that index is "never a
*displayable* node": the engine still INGESTS index docs as graph nodes, still
STORES them, still CATEGORIZES them (authority class `manifest`), and merely
FILTERS them out of two wire projections at serialization time. The `index`
doc-type also remains a first-class member of the category vocabulary on both
sides. This research maps every site so the campaign can go further: drop index at
ingest (never a node), and remove the `index` type from the vocabularies entirely.

A second, related confusion surfaced: the dashboard maps the `summary` document
kind to the `index` category color. `summary` documents are not indexes — they are
`exec` documents (`.vault/exec/*-summary.md`, a Phase Summary of exec records); the
engine already classifies them as `exec` (their `.vault/exec/` directory). The
`summary → index` mapping is the same metanode confusion and must be corrected to
`summary → exec`.

## Findings

### F1 — Two node-minting sites assign `doc_type` from the `.vault/` subdir

`doc_type_of(rel_path)` (`engine/crates/engine-graph/src/index.rs`) returns the
first path segment under `.vault/`, so `.vault/index/<feat>.index.md` → `"index"`.
Document nodes carrying that `doc_type` are minted at exactly two places:

- `engine-graph/src/index.rs` ~line 299 — the structural reader's `upsert_node`.
- `engine-graph/src/asof.rs` ~line 204 — the as-of temporal replay's `upsert_node`.

The core-declared graph path (`ingest_declared_from_json`,
`engine-graph/src/index.rs:631`) ingests only EDGES, not document nodes. But
index documents' `related:`/wiki-links produce declared edges INCIDENT to the index
stem, so dropping the index node alone risks resurrecting it as a phantom node via
`edges::ingest`. The clean fix tracks the set of excluded (index) node ids during
ingest and drops both the node AND any edge incident to an excluded id — no phantom
resurrection.

### F2 — `index` is woven into the engine categorization vocabulary

- `engine-query/src/ontology.rs:28` — `authority_class("index") => "manifest"`
  (and the doc-comment at line 15 + test at line 337).
- `engine-query/src/salience/ontology.rs` — `AuthorityClass::Manifest` variant
  (line 36), the `"manifest" => Manifest` lift (line 55), doc-comment (line 46),
  and test (line 179). `Manifest` is consumed only in `salience.rs:111,121`, where
  it weights to `0.0` — identical to `AuthorityClass::None`. Removing the variant
  and the `index` mapping degrades a stray index node to `unknown → None → 0.0`,
  preserving behavior.
- `engine-query/src/ontology.rs` — `is_aggregate_species` test enumerates
  `"index"` among individually-weighted types (~line 348).
- `engine-query/src/pipeline.rs:91` — `phase_for_doc_type` already returns `None`
  for index (no pipeline/timeline lane); the comment naming index can stay or be
  simplified.

### F3 — The display-layer exclusion (`is_displayable_node`) becomes a defensive net

`engine-query/src/graph.rs:206` drops `doc_type == "index"` (and
`NodeKind::CodeArtifact`) from `/vault-tree` rows and the graph query. With
ingest-level drop, the index branch becomes dead for the live path but is worth
KEEPING as a single documented belt-and-braces guard (the same producer+consumer
pattern the bounded-query rules use) — re-pointed to "defends against any future
producer that re-mints an index node".

### F4 — `index` is a first-class category token in the dashboard vocabulary

- `frontend/src/app/kit/category.ts` — `CategoryToken` includes `"index"` (line
  20); the chrome chip/badge/StatusDot category. `summary`/`step` already map to
  `exec` here (correct).
- `frontend/src/scene/field/categoryColor.ts` — `NodeCategory` includes `"index"`
  (line 29); `summary => "index"` mapping (line 64, WRONG — should be `exec`); the
  `index: 0x8f9a7e` fallback color (line 93); the `index` switch arm (line 58).
- `frontend/src/scene/field/categoryColor.test.ts` — asserts `summary === index`
  and enumerates index (lines 14, 22, 25, 57, 69).
- The scene token `--color-scene-category-index` is emitted per theme from the
  DTCG token source; removing the category means dropping that generated token
  (regenerate, never hand-edit the managed region).
- `frontend/src/prototype/StatusGallery.tsx:41` and `frontend/src/three-lab/
  sampleGraph.ts` (a `doc:index-graph` fixture node with `doc_type: "index"` plus
  its edge) carry index references; lab/prototype are out of the production build
  but should be made consistent so they don't reintroduce the vocabulary.

### F5 — Timeline, features, and salience already exclude index transitively

`lineage.rs` only projects nodes whose `doc_type` has a pipeline phase, so index
(phase `None`) never becomes a lineage/timeline node. Salience reads query results
(already filtered). Feature membership is by `feature_tags`; index docs carry
feature tags but, once dropped at ingest, contribute no node and no edge. So no
additional timeline/feature site needs a bespoke index filter — the ingest drop is
the single upstream fix, and `phase_for_doc_type`/`is_displayable_node` remain the
honest downstream guards.

### F6 — Summary is an exec document, not an index

`summary` documents live in `.vault/exec/` (`*-summary.md`), so the engine's
`doc_type_of` already returns `"exec"` for them — the engine treats them correctly.
The only defect is the dashboard's `summary → index` color mapping; corrected to
`summary → exec`, summaries paint as the exec category they are.
