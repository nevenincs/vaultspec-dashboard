---
tags:
  - '#plan'
  - '#index-node-exclusion'
date: '2026-06-20'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-20-index-node-exclusion-adr]]'
  - '[[2026-06-20-index-node-exclusion-research]]'
---

# `index-node-exclusion` plan

Drop `.vault/index` documents at engine ingest and remove the `index` doc-type from every categorization vocabulary, backend and frontend.

### Phase `P01` - engine: drop index documents at ingest

Index documents never become LinkageGraph nodes; both node-minting sites skip doc-type index and the declared-edge ingest drops edges incident to an excluded index id.

- [x] `P01.S01` - Skip the upsert of any document whose derived doc_type is index in the structural reader; `engine/crates/engine-graph/src/index.rs`.
- [x] `P01.S02` - Skip the upsert of index doc_type documents in the as-of temporal replay; `engine/crates/engine-graph/src/asof.rs`.
- [x] `P01.S03` - Track an excluded index-id set and drop declared/core-derived edges incident to it; `engine/crates/engine-graph/src/index.rs`.
- [x] `P01.S04` - Add a test that an index document yields no node and no incident edge at both ingest paths; `engine/crates/engine-graph/src/index.rs`.

### Phase `P02` - engine: purge index from the categorization vocabulary

Remove the index to manifest authority mapping and the now-unused AuthorityClass Manifest variant, and re-document the retained is_displayable_node guard as defensive-only.

- [x] `P02.S05` - Remove the index to manifest arm and doc-comment from the authority-class register; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P02.S06` - Delete the AuthorityClass Manifest variant and its lift, folding salience consumers to None; `engine/crates/engine-query/src/salience/ontology.rs`.
- [x] `P02.S07` - Update ontology and salience tests that enumerate index or manifest; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P02.S08` - Re-document the retained is_displayable_node index branch as a defensive-only guard; `engine/crates/engine-query/src/graph.rs`.

### Phase `P03` - dashboard: remove the index category token and fix summary

Drop index from the chrome and scene category vocabularies and its generated color token, and correct the summary kind to map to exec.

- [x] `P03.S09` - Remove the index token from CategoryToken and any chrome branch; `frontend/src/app/kit/category.ts`.
- [x] `P03.S10` - Remove index from NodeCategory and its color, and map the summary kind to exec; `frontend/src/scene/field/categoryColor.ts`.
- [x] `P03.S11` - Update categoryColor tests to assert summary equals exec and drop index assertions; `frontend/src/scene/field/categoryColor.test.ts`.
- [x] `P03.S12` - Regenerate the token source to drop the scene-category-index color token; `frontend/tokens`.
- [x] `P03.S13` - Update lab and prototype fixtures that reference the index doc-type; `frontend/src/three-lab/sampleGraph.ts`.
- [x] `P03.S16` - Remove code from the scene NodeCategory and the graph silhouette mark, keeping the code token for the preserved Files and search browser; `frontend/src/scene/field/categoryColor.ts`.
- [x] `P03.S17` - Remove index from the remaining frontend category vocabularies (marks, searchPill, timeline dots, markdown-reader header, frontmatter tags, changed-document rows, docTypeFromStem); `frontend/src/stores/server/queries.ts`.

### Phase `P04` - gate and live verification

Run the full lint and test gate to exit 0 and live-verify the dashboard is index-free across graph, rail, and timeline.

- [x] `P04.S14` - Run just dev lint all and cargo and frontend tests to exit 0; `engine`.
- [x] `P04.S15` - Live-verify the dashboard renders index-free across graph, rail, timeline, and legend; `frontend/src/app`.

## Description

This plan implements the `index-node-exclusion` ADR, which amends
`terminology-standardization` D5 from a display-only filter to a hard ingest-level
exclusion. Per the research inventory, index documents are minted as nodes at two
sites (the structural reader and the as-of replay), categorized in the engine
ontology/salience register (`manifest`), and carried as a first-class `index`
category token in both dashboard category modules. The dashboard additionally
miscolors `summary` documents (which are `exec` documents) as `index`.

Phase `P01` stops index documents from ever becoming graph nodes, tracking an
excluded-id set so core-declared edges cannot resurrect them as phantom nodes.
Phase `P02` purges the `index`/`manifest` categorization from the engine ontology
and salience register (behavior-preserving, since `Manifest` weights identically to
`None`) and re-documents the retained `is_displayable_node` guard as a single
defensive net. Phase `P03` removes the `index` token from the chrome and scene
category vocabularies, drops its generated color token, corrects `summary -> exec`,
and cleans lab/prototype fixtures. Phase `P04` runs the full gate and live-verifies
the dashboard is index-free.

## Steps

## Parallelization

Phases `P01` (engine ingest) and `P03` (dashboard vocabulary) are independent and
may run in parallel. `P02` (engine ontology purge) shares engine crates with `P01`
and shares the test gate, so it is sequenced after `P01` to avoid colliding edits in
the same files. `P04` (gate + live verify) is the closing phase and depends on all
of `P01`-`P03`. Within `P01`, the two node-site drops (`S01`, `S02`) are independent
of each other but both precede the incident-edge drop (`S03`) and the test (`S04`).

## Verification

- An engine test asserts a `.vault/index/*.index.md` document produces no
  `LinkageGraph` node and no edge incident to its stem (no phantom resurrection),
  at both the structural and as-of ingest paths.
- `grep` for `manifest`/`Manifest` and `"index"` doc-type categorization in
  `engine/crates` returns only the retained defensive `is_displayable_node` guard
  (and unrelated array/HashMap "index" uses); the `AuthorityClass::Manifest` variant
  is gone.
- `grep` for the `index` category token in `frontend/src` returns no `CategoryToken`
  / `NodeCategory` membership and no `--color-scene-category-index`; `summary` maps
  to `exec` in both category modules.
- `cargo test` (engine) and the frontend test suite pass; `categoryColor.test.ts`
  asserts `summary === exec`.
- `just dev lint all` exits 0 (eslint + prettier + tsc + cargo fmt + clippy), per
  `declaring-green-runs-the-full-gate`.
- Live verification: the dashboard renders against a real corpus with no index node
  in the graph, no index row in the rail, no index lane/event in the timeline, and
  no index entry in the graph legend.
