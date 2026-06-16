---
tags:
  - '#plan'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
tier: L2
related:
  - '[[2026-06-16-review-rail-viewers-adr]]'
  - '[[2026-06-16-review-rail-viewers-research]]'
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

# `review-rail-viewers` plan

Build the frontmatter-aware markdown reader, the read-only code viewer, the bounded engine content endpoint behind them, and the right-rail overview re-scope, all cross-linked to the graph.

### Phase `P01` - engine read-only content-fetch route

Add the bounded, read-only GET /nodes/{id}/content engine route through the shared envelope, byte-capped and tiers-bearing.

- [x] `P01.S01` - Add a MAX_CONTENT_BYTES ceiling and a content reader resolving a doc:/code: node id to its repo-relative path; `engine/crates/vaultspec-api/src/routes/content.rs`.
- [x] `P01.S02` - Implement GET /nodes/{id}/content: validate scope, guard path traversal, read bytes via read_from_worktree/read_from_ref, derive language_hint from extension; `engine/crates/vaultspec-api/src/routes/content.rs`.
- [x] `P01.S03` - Return {path, blob_hash, byte_len, language_hint, text, truncated} through the shared envelope with the tiers block, byte-capped with an honest truncated block; `engine/crates/vaultspec-api/src/routes/content.rs`.
- [x] `P01.S04` - Degrade the structural tier on an unreadable worktree and return a tiered 400 on traversal or missing path via degraded_tiers_for and api_error; `engine/crates/vaultspec-api/src/routes/content.rs`.
- [x] `P01.S05` - Register the route and add it to CONTRACT_ROUTES, bearer-gated by the existing middleware; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `P01.S06` - Add engine tests for success, byte-cap truncation, traversal 400, and structural degradation; `engine/crates/vaultspec-api/src/routes/content.rs`.

### Phase `P02` - stores content query layer

Add the sole stores-layer client of the content route: a bounded content query, a tolerant adapter, mock fidelity, and a tiers-derived degraded selector.

- [x] `P02.S07` - Add a bounded content query keyed by {scope, nodeId} with explicit gcTime and a cache cap, as the sole wire client of /nodes/{id}/content; `frontend/src/stores/server/queries.ts`.
- [x] `P02.S08` - Add a tolerant content adapter normalizing the wire shape, blob_hash content-addressing the cache entry; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `P02.S09` - Mirror the live /nodes/{id}/content shape exactly in the mock engine and feed a captured live sample through the adapter in a fidelity test; `frontend/src/stores/server/mockEngine.ts`.
- [x] `P02.S10` - Expose a content selector that derives degraded/offline state from the tiers block, never from a transport error; `frontend/src/stores/server/selectors.ts`.
- [x] `P02.S11` - Add a view-store open-in-viewer intent carrying the target node id and the active viewer surface; `frontend/src/stores/view/viewStore.ts`.

### Phase `P03` - shared Shiki highlighter

Stand up the one shared Shiki highlighter (fine-grained core, JS regex engine, lazy grammar/theme imports) themed from the OKLCH token tier.

- [x] `P03.S12` - Add shiki/core, the JS regex engine, and the lang/theme packages to the frontend dependencies (runtime, never rag/torch); `frontend/package.json`.
- [x] `P03.S13` - Build a useHighlighter hook owning a singleton createHighlighterCore with per-language and per-theme dynamic import lazy registration; `frontend/src/app/viewer/useHighlighter.ts`.
- [x] `P03.S14` - Bind Shiki token colors to the OKLCH semantic token tier so light, dark, and high-contrast are three theme maps with no per-surface color; `frontend/src/app/viewer/highlighterTheme.ts`.
- [x] `P03.S15` - Map the required language set and the long tail to grammar loaders and a language_hint resolver shared by both viewers; `frontend/src/app/viewer/languages.ts`.

### Phase `P04` - frontmatter-aware markdown reader

Build the display-only markdown reader: structured frontmatter, GFM, wiki-link navigation, and Shiki-highlighted fences.

- [x] `P04.S16` - Add react-markdown, remark-gfm, and frontmatter handling to the frontend dependencies; `frontend/package.json`.
- [x] `P04.S17` - Build the MarkdownReader component rendering GFM including plan task-list checkboxes, themed entirely from the existing --color tokens; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P04.S18` - Render the leading YAML block through a dedicated FrontmatterHeader: tags as pills, date and modified as stamps, related as clickable wiki-links; `frontend/src/app/viewer/FrontmatterHeader.tsx`.
- [x] `P04.S19` - Add a custom remark plugin rewriting double-bracket stem and stem-pipe-label wiki-link syntax into in-app link nodes resolving to doc:stem and emitting the navigation intent; `frontend/src/app/viewer/remarkWikiLink.ts`.
- [x] `P04.S20` - Override fenced code rendering to delegate to the shared useHighlighter hook so reader fences and the code viewer share one tokenizer; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P04.S21` - Render the reader degraded, empty, and error states from the tiers-derived content selector; `frontend/src/app/viewer/MarkdownReader.tsx`.

### Phase `P05` - read-only code-file viewer

Build the display-only code viewer over the shared highlighter with lazy grammar loading and virtualized lines.

- [x] `P05.S22` - Build the CodeViewer component taking {path, text, language_hint}, picking the grammar via the shared hook, rendering highlighted lines with line numbers and a monospace path header; `frontend/src/app/viewer/CodeViewer.tsx`.
- [x] `P05.S23` - Virtualize the line list so a large capped file scrolls cheaply, with no editing affordances; `frontend/src/app/viewer/CodeViewer.tsx`.
- [x] `P05.S24` - Render the viewer degraded, empty, truncated, and error states from the tiers-derived content selector and the truncated block; `frontend/src/app/viewer/CodeViewer.tsx`.
- [x] `P05.S25` - Host the two viewers behind the open-in-viewer view-store intent so a selection routes to the markdown reader or the code viewer by node kind; `frontend/src/app/viewer/ViewerSurface.tsx`.

### Phase `P06` - right-rail overview re-scope and cross-link wiring

Recast the Changes pillar as the Overview snapshot and wire every row's cross-links to file, node, and viewer, holding the four-tab law.

- [ ] `P06.S26` - Recast the Changes pillar as the Overview snapshot section composition, holding the four-tab law and optionally relabelling the tab to Overview; `frontend/src/app/right/ChangesOverview.tsx`.
- [ ] `P06.S27` - Render the changed-source-files section with each row cross-linking to the worktree path, the code:path node, and opening the code viewer; `frontend/src/app/right/ChangesOverview.tsx`.
- [ ] `P06.S28` - Render the changed-documents section with each row cross-linking to the doc:stem node and opening the markdown reader; `frontend/src/app/right/ChangesOverview.tsx`.
- [ ] `P06.S29` - Feed the per-file diff body in DiffView from the new content route, replacing the engine-blocked capability-pending placeholder; `frontend/src/app/right/DiffView.tsx`.
- [ ] `P06.S30` - Wire Work-tab plan and step rows to open the plan document in the markdown reader and focus the plan node; `frontend/src/app/right/WorkTab.tsx`.
- [ ] `P06.S31` - Wire the left-rail vault and code rows and the Inspector evidence rows to open the viewers in addition to selecting the node; `frontend/src/app/left/browserSelection.ts`.
- [ ] `P06.S32` - Keep recent history as a compact commits-plus-doc-events list within the overview, deferring the rich temporal view to the existing timeline; `frontend/src/app/right/ChangesOverview.tsx`.

### Phase `P07` - verification

Prove the content contract, viewer rendering, theming, IA, and gates green; code-review to PASS.

- [x] `P07.S33` - Run the full frontend lint gate and the engine fmt-plus-clippy gate to exit 0 including prettier format:check and tsc; `frontend/package.json`.
- [x] `P07.S34` - Add component tests for frontmatter rendering, wiki-link navigation, GFM task lists, and code highlighting across light, dark, and high-contrast themes; `frontend/src/app/viewer/MarkdownReader.test.tsx`.
- [ ] `P07.S35` - Verify the four-tab law holds and every Overview row cross-links to file, node, and viewer with no inlined content; `frontend/src/app/right/ChangesOverview.test.tsx`.
- [ ] `P07.S36` - Run vaultspec-code-review over the feature and land any required revisions to a PASS verdict; `.vault/audit/2026-06-16-review-rail-viewers-audit.md`.

## Description

This plan implements the `review-rail-viewers` ADR. It delivers three intertwined
display-only surfaces and the backend that feeds them: a vaultspec-frontmatter-aware
markdown reader, a syntax-highlighted code-file viewer (both sharing one Shiki
highlighter themed from the OKLCH token tier), a new bounded read-only engine
content-fetch route (`GET /nodes/{id}/content`) consumed solely by
`frontend/src/stores/`, and the right rail re-scoped as an informational Overview
snapshot whose every row cross-links to the worktree file, the graph node, and/or the
viewer. The work respects the four-layer ownership boundaries: the route is engine
read-and-infer, `stores/` is its sole client and reads the `tiers` block, and the
viewers and rail are dumb `app/` chrome that fetch nothing.

Phases are ordered by dependency: the engine route and the stores query come first
(they unblock everything), then the shared highlighter, then the two viewers, then the
rail re-scope and cross-link wiring, then verification. The library choices, endpoint
shape, IA decision, and cross-link model are all fixed by the ADR and grounded in the
research findings (F1-F8); read both before executing any step.

## Steps

The seven Phase blocks (`P01`-`P07`) and their Steps (`P01.S01`-`P07.S36`) are
serialized as the canonical structure directly beneath the plan headline above. This
document is updated between execution runs to track per-Step completion.

## Parallelization

Phase `P01` (engine content route) is the hard prerequisite for `P02` (stores query),
which is the prerequisite for the two viewers. Within that ordering:

- `P01` must land first; it is independent engine work and can proceed alone.
- `P02` depends on `P01` (the wire shape it consumes) but its mock-engine fidelity step can begin from the ADR's response shape in parallel with `P01`'s tail.
- `P03` (shared Shiki highlighter) has no engine dependency and can run in parallel with `P01`/`P02`.
- `P04` (markdown reader) and `P05` (code viewer) both depend on `P02` (content query) and `P03` (highlighter); once those land, `P04` and `P05` are independent of each other and parallelizable.
- `P06` (right-rail overview re-scope + cross-link wiring) depends on `P04` and `P05` (it opens the viewers) and on `P02` (changed-files/changed-docs data); it lands last.
- `P07` (verification) is sequenced after all delivery phases.

## Verification

The plan is complete when every Step is closed (`- [x]`) and:

- The full frontend lint gate is green: `just dev lint frontend` exits 0 including prettier `format:check` and `tsc` (per `declaring-green-runs-the-full-gate`); the engine gate `cargo fmt --check` + `cargo clippy` is green for the new route.
- The content route returns `{path, blob_hash, byte_len, language_hint, text, truncated?}` through the shared `envelope`, carries the `tiers` block on success and error, is byte-capped with an honest `truncated` block, rejects path traversal with a tiered 400, and degrades the structural tier on an unreadable worktree; `/vault-tree` and `/file-tree` remain byte-free. Verified by engine tests.
- A captured live `/nodes/{id}/content` sample feeds through the stores adapter and matches the mock-engine shape (per `mock-mirrors-live-wire-shape`); the stores content query is bounded (explicit `gcTime` + cache cap, per `bounded-by-default-for-every-accumulator`) and the viewer's degraded state reads from `tiers`, not transport error.
- The markdown reader renders `.vault/` frontmatter as structured chrome (tags pills, dates, clickable `related` wiki-links), GFM including plan task-list checkboxes, resolves double-bracket wiki-link syntax to in-app navigation, and renders fenced code through the shared Shiki highlighter; it themes correctly under light, dark, and high-contrast.
- The code viewer highlights the full required language set (py, rs, js, ts, jsx/tsx, bash, batch, powershell, c, c++, json, toml, yaml, md) with lazy grammar loading and token colors bound to the OKLCH theme tier across all three themes; it is display-only with no editing affordances.
- The right rail holds the four-tab law (Inspect/Work/Changes/Search, no fifth tab); the Overview pillar's changed-files, changed-docs, plan-status, and history rows each cross-link to the worktree path, the graph node, and/or open the correct viewer; no content is inlined in the rail.
- `vaultspec-core vault check all` is green for the feature's documents, and the work is reviewed via `vaultspec-code-review` with verdict PASS.
