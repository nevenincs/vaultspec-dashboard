---
tags:
  - '#research'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-07-03-rag-integration-hardening-research]]'
  - '[[2026-06-14-dashboard-rag-search-adr]]'
  - '[[2026-06-21-command-palette-architecture-research]]'
---

# `search-providers` research: `the Cmd+K search plane as a provider architecture`

Three tracks grounded the expansion of Cmd+K search into a formal provider model —
semantic (rag), files (code), files (vault) — with no internal vocabulary on screen:
(A) the current palette architecture and terminology, (B) the binding Figma designs
for the search surface, (C) backend capability for the files providers. All three
converge: the feature is a stores-layer extraction plus exactly ONE new wire seam.

## Findings

### Track A — the palette is already a de-facto provider system

- One overlay, three modes (`frontend/src/app/palette/CommandPalette.tsx:76`):
  Mod+K commands, Mod+P semantic search (`SearchPaletteSurface`), Mod+Shift+O literal
  document finder (`DocumentSearchSurface`) — all bound through the one keymap
  registry (`frontend/src/stores/view/commandPalette.ts:566-651`).
- `useUnifiedSearchController` (`frontend/src/stores/server/searchController.ts:919`)
  already composes two per-corpus controllers behind the pure `mergeUnifiedSearch`
  (`:866`) — the provider pattern in miniature. Shared machinery to lift into a
  provider host: 200ms debounce, per-source TanStack keys, tiers-gated
  `isSemanticOffline` (`:129`), the `interpretSearch` state machine (`:525`),
  score-desc merge + identity dedupe (`:860`), the 40-item bound (`:807`), the shared
  `semanticEpoch` (`:840`), and backends-stream cache invalidation (`:756`).
  Per-provider: the fetch, the rank band (vault text fallback capped below semantic
  certainty, `:80-96`), and each source's empty/degraded semantics.
- Activation is already the one open verb: `activateEntity(nodeId, scope,
  {permanent, frame})` from both planes (`SearchPaletteSurface.tsx:183`,
  `DocumentSearchSurface.tsx:66`).
- The pill face already hides mechanism (no score, no semantic-vs-text distinction;
  `frontend/src/stores/server/searchPill.ts:8`, derivations at `:246`) — but has no
  isolated test file (gap to close).
- Keyboard model: single combobox input with a manual cursor
  (`SearchPaletteSurface.tsx:190`), not a FocusZone; keep it.
- TERMINOLOGY: exactly one user-facing internal-vocabulary string — the degraded
  StateBlock "Semantic search is offline — showing title and text matches."
  (`commandPalette.ts:174`, sr-only twin `:195`) plus the idle prompt "…by meaning"
  (`:170`). The unmounted right-rail presentation strings ("Ranked by meaning",
  "text match" badge, `searchController.ts:457-487`) reword-or-delete with the
  refactor. Degraded-copy honesty must survive rewording (the shown band is lesser
  and the fuller mode is down); the 2026-06-14 search ADR's wording is illustrative,
  not pinned. The rag operations console is a sanctioned ops-console exception.
- VESTIGIAL: the right-rail search pillar is dead — `AppShell.tsx:302` mounts only
  `StatusTab` for every tab, yet `DASHBOARD_PANEL_TABS` still lists "search"
  (`engine.ts:648`) and `rightRailFocusSearchAction`/`focusRightRailSearch`
  (`rightRailKeybindings.ts:71`, `rightRailCommandProvider.ts:12`) still enroll a
  command that switches to a tab rendering nothing distinct. The single-target
  `useSearchController` presentation view is exercised only by unit tests. Fold or
  delete with this feature (no permanently-disabled lies, no dead commands).

### Track B — the binding design already encodes the provider vocabulary

Binding file `SlhonORmySdoSMTQgDWw3w`:

- `SearchPaletteSurface.list` (651:1771): a compact palette — query header with a
  results count, then ONE ranked, INTERLEAVED list of species-tagged pills (not
  sectioned by provider), Kbd footer (up/down move, enter open, esc close).
- `SearchPaletteSurface.expanded` (652:1804) and `.expanded.doc` (666:2038): a split
  view — result list left (24rem), live READER right that varies by species: a
  read-only code viewer (filename, language badge, Copy, line numbers, syntax
  excerpt — the `_MarkdownReader/CodeBlock` kit composite) for code hits; a markdown
  reader (doc-type eyebrow, serif title, subtitle, date, rendered body) for doc
  hits. Footer adds left/right previous-next; header shows "result N of M".
- `SearchResultPill` (650:1790): species eyebrow + title + one-line why + optional
  feature chip. Species observed: doc-type names ("Research", scene category
  tokens), "Code" (category-code color, mono title), "Change" (commit: accent color,
  author-and-relative-time meta). Selected = sunken fill + accent border.
- The species vocabulary IS the user-facing provider vocabulary: plain words, zero
  rag/semantic terms anywhere in the design. A "Change" (commit) species is designed
  beyond the three mandated providers — scope it as a follow-on provider the seam
  must make incremental, not part of this feature's build.

### Track C — backend capability: one provider is free, one needs a route

- files(vault): FREE. `useVaultTree` already walks `/vault-tree` to completion
  (bounded 25 pages x 2000; live-probed on this repo: 1,429 entries, 566 KB, one
  page, no cursor) with `{stem, node_id, title, doc_type, feature_tags, ...}` per
  entry — `node_id` = `doc:{stem}` pre-computed engine-side
  (`engine-query/src/graph.rs:526`; adapter path synthesis
  `liveAdapters.ts:1080`). `documentSearchController.ts:45` already narrows it
  (stem/path/doc_type tokens, 40 cap); adding `title` to the match fields is the
  only expansion. Satisfies the complete-paginated-set rule as-is.
- files(code): NEEDS A NEW ENGINE ROUTE. No complete flat code-file listing exists:
  `/file-tree` is one directory level per call (500/page, 2000/level cap,
  `file_tree.rs`), and `/graph/query?corpus=code` is DOI-bounded at
  `MAX_GRAPH_NODES=5000` (`engine-query/src/graph.rs:219`; live-probed 818 nodes /
  1.17 MB here, but silently top-DOI on large repos) — narrowing either client-side
  violates the graph.md no-client-re-derive and filtering.md complete-set rules.
  Recommended: `GET /code-files` mirroring `build_vault_tree_rows`
  (`graph.rs:510`) — project ALL `code:`-prefixed nodes off the `LinkageGraph`
  (not the DOI projection), minimal shape `{path, node_id, title, lang}`,
  cursor-paginated 2000/page, memoized per graph `generation`, honest `truncated`
  block when the 50,000-file walk cap was hit; client walks the cursor to
  completion like `vaultTree()` (`engine.ts:1808`). Roughly 100 KB on this repo.
- Matching stays client-side (no engine fuzzy capability; substring match over even
  50k paths is under 10ms in JS); two existing matchers (`matchDocumentEntries`,
  `buildFallbackResults`) are direct string scans — a small shared match/rank
  utility is justified.
- Identity: every code-graph file mints exactly one `code:{path}` node (files-only
  representation, 2026-07-03 graph-representation cutover); a `/code-files` route
  sourced from the graph guarantees every hit is navigable. `/file-tree`-sourced
  hits could point at absent nodes (non-source files) — another reason to source
  from the graph.

### Decision candidates for the ADR

1. **Provider seam**: a `SearchProvider` contract + `useSearchProviders` host in
   `frontend/src/stores/server/`, lifting the existing shared machinery; providers:
   semantic (today's unified pair, unchanged), files(vault) (generalized document
   matcher over the cached complete vault tree), files(code) (new `/code-files`
   reader + client matcher). Merge stays one interleaved ranked list per the design;
   files hits rank in a literal band distinct from the semantic band (design shows
   interleaving — the band policy is the decision).
2. **The one contract event**: the `GET /code-files` engine route + `useCodeFiles`
   cursor-walking stores reader (reviewed as a deliberate wire addition).
3. **Plane collapse + terminology**: Mod+P becomes plain "Search" running all
   providers; decide the literal document mode's fate (keep as files-only fast
   finder vs fold into the provider plane with a filter); reword the degraded copy
   and idle prompt; delete the dead right-rail search pillar (tab entry + commands +
   unmounted presentation view) or fold it into the palette open action.
4. **The designed expanded reader split** (list + reader pane, previous/next,
   result counter): decide build-now vs follow-on — it needs content fetches (doc
   body, code excerpt) beyond the current pill list. The `.list` compact state is
   the minimum deliverable matching the design.
5. **Species vocabulary**: pill eyebrows use doc-type names / "Code" / (future)
   "Change" with scene category tokens per the design; the "Change" commit provider
   is designed but explicitly out of scope — the seam must admit it later without
   re-architecture.

### Sources

- `frontend/src/app/palette/CommandPalette.tsx:66-78,274-311`;
  `SearchPaletteSurface.tsx:117,183,190`; `DocumentSearchSurface.tsx:66-78`
- `frontend/src/stores/server/searchController.ts:78-108,129,217,525,659,756,807,840,860,866,919`
- `frontend/src/stores/server/documentSearchController.ts:24,45-105`
- `frontend/src/stores/server/searchPill.ts:8,246`;
  `frontend/src/stores/view/commandPalette.ts:17-53,170-195,566-651`
- `frontend/src/stores/server/engine.ts:326,648,1808-1828`;
  `liveAdapters.ts:1080,1610`; `queries.ts:1981-2027,3104-3179`
- `frontend/src/app/AppShell.tsx:302`; `rightRailKeybindings.ts:71`;
  `rightRailCommandProvider.ts:12`
- `engine/crates/vaultspec-api/src/routes/file_tree.rs:73-178`;
  `engine/crates/engine-query/src/graph.rs:219,510-545`;
  `engine/crates/ingest-code/src/modules.rs:107,283`
- Figma `SlhonORmySdoSMTQgDWw3w`: 651:1771 (list), 652:1804 (expanded code),
  666:2038 (expanded doc), 650:1790 (result pill)
- Live probes (dev engine 8767, read-only): vault-tree 1,429 entries / 566 KB /
  one page; graph/query corpus=code 818 nodes / 1.17 MB / not truncated
- Prior decisions: 2026-06-14 dashboard-rag-search ADR (degradation copy honesty),
  2026-07-03 rag-integration-hardening ADR (flat /search contract, freshness),
  2026-06-21 command-palette-architecture research, 2026-07-03 graph-representation
  ADR (files-only code graph)
