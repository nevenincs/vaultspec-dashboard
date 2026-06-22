---
tags:
  - '#plan'
  - '#graph-filter-fetch-split'
date: '2026-06-22'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-22-graph-filter-fetch-split-adr]]'
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
     Replace graph-filter-fetch-split with a kebab-case feature tag, e.g. #foo-bar.
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

# `graph-filter-fetch-split` plan

### Phase `P01` - Smooth, cache-first graph-slice fetch (D1)

The graph-slice query shows the prior bounded slice while a Tier-1 change loads, so filtering never blanks and a previously-seen filter is cache-instant.


Make graph filtering smooth and stop wasted re-queries without serving un-consumed data, per the accepted two-tier-filter ADR.

- [x] `P01.S01` - Add placeholderData keepPreviousData to the graph-slice useQuery (and its salience sibling delegate); `frontend/src/stores/server/queries.ts`.

### Phase `P02` - Keep node facets engine-side; pin the correctness gate (D2 rejected)

The feature-aggregation and node-ceiling gates make node/edge/text facets un-client-narrowable, so dashboardGraphFilter keeps forwarding them to the engine; a documenting comment and a test pin the invariant so no future agent re-introduces the hazard.

- [x] `P02.S02` - Document in dashboardGraphFilter why node, edge, and text facets stay engine-side (feature-aggregation and node-ceiling correctness gates); `no behaviour change; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P02.S03` - Add a stores test pinning that dashboardGraphFilter forwards every node, edge, and text facet into the query filter at both feature and document granularity; `frontend/src/stores/server/dashboardState.test.ts`.

### Phase `P03` - Confirm client narrowing, neighbors, legend; verify (D3/D4)

Tier-2 narrowing reuses the existing client membership unchanged; neighbor egos and the legend stay client-narrow; the whole path is gated and live-verified.

- [x] `P03.S04` - Add a stores test asserting the graph cache key is filter-sensitive (a filter change is a distinct entry, an identical filter reuses the entry) so the engine re-queries the limited set and a repeat is cache-instant; `frontend/src/stores/server/queries.test.ts`.
- [x] `P03.S05` - Run the frontend gate and affected vitest, then headless-verify that a filter change keeps the prior slice (no blank) and document-LOD fetches stay bounded; `frontend/src/stores/server`.

## Description

Grounds out the accepted two-tier-filter ADR (and its rag-driven research). The
engine already filters the main slice and both LODs are payload-bounded, so this work
does NOT add engine filtering. It removes the two real defects: the slice query blanks
and re-fetches on every filter change, and feature-LOD node-facet toggles re-query for
zero payload reduction. `D1` gives the query `keepPreviousData` so a refetch never
blanks and a seen filter is cache-instant. `D2` splits the query-filter builder so the
engine receives only payload-bounding Tier-1 facets, granularity-aware: node-reducing
facets stay server-side at document granularity (the `MAX_DOCUMENT_NODES` ceiling gate)
and are omitted at feature granularity, where the existing client visibility membership
narrows them with no re-query. `D4`: neighbor egos and the legend mask stay
client-narrow.

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

P01 is independent and lands first as a pure win (no behaviour change to what the
backend serves). P02 is the core change and shares no interdependency with P01, so the
two Phases may proceed in parallel. Within P02, S02 precedes S03 (the test pins the
split S02 introduces). P03 depends on P02 landing: S04 asserts the no-re-query
behaviour S02 enables, and S05 (gate + live verify) runs last.

## Verification

- `placeholderData: keepPreviousData` is set on the graph-slice query; a filter change
  no longer blanks the prior data (asserted in a stores test or confirmed live).
- `dashboardGraphFilter` omits the node-reducing facets from the query at feature
  granularity and includes them at document granularity; a unit test pins the boundary
  AND the ceiling-correctness gate (document granularity ALWAYS sends the node facets).
- A feature-granularity node-facet toggle produces an UNCHANGED graph query key (no
  re-query) while the client visibility membership still narrows the served slice; a
  unit test asserts both halves.
- The frontend gate (`just dev lint frontend`) is exit 0 on the touched files and the
  affected vitest suites pass; a headless run confirms a feature-LOD facet toggle
  issues no new `/graph/query` and document-LOD fetches stay bounded.
- The plan is complete when every Step is closed (`- [x]`).
