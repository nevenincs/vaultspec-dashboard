---
tags:
  - '#plan'
  - '#index-node-exclusion'
date: '2026-06-20'
modified: '2026-06-21'
tier: L2
related:
  - '[[2026-06-20-index-node-exclusion-adr]]'
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
     Replace index-node-exclusion with a kebab-case feature tag, e.g. #foo-bar.
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

- [ ] `P04.S14` - Run just dev lint all and cargo and frontend tests to exit 0; `engine`.
- [ ] `P04.S15` - Live-verify the dashboard renders index-free across graph, rail, timeline, and legend; `frontend/src/app`.

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
