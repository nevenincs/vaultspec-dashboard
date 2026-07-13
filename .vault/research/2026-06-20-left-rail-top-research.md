---
tags:
  - '#research'
  - '#left-rail-top'
date: '2026-06-20'
modified: '2026-07-12'
related:
  - '[[2026-06-20-left-rail-top-adr]]'
---

# `left-rail-top` research: `Left rail top: scope, search, and filter grounded reality`

The left rail's top area — the project/worktree picker, the search bar, and the
filter controls — has accreted across several cycles, leaving fragmented and
partly-unbuilt requirements. This grounds the redesign in the ACTUAL backend
(`engine/`) and frontend (`frontend/src/`) implementation so the reconciliation
ADR decides from fact, not intent.

## Findings

### F-SCOPE — Workspace › Worktree › Project; the scope is a worktree path

- A `scope` is the absolute worktree checkout path (the `scope` query param;
  `scope_token()` in `engine-model`), the unit every read is keyed by.
- A `Workspace` is one git repository (its common `.git` dir,
  `ingest-git/workspace.rs`); a `Worktree` is one checkout of it
  (`ingest-git/worktrees.rs`). One workspace has many worktrees.
- A `Project` is frontend user-state: a registered workspace root in the
  `vaultspec-session` workspace registry. Project ≈ workspace, not a git concept.
- `WorktreePicker` is BUILT: shows the current worktree NAME and switches scope
  via `activateWorktreeScope` → durable `putSession` → a wholesale reset
  (`setScope` re-keys pin/lens stores, `resetCorpusLocalStores` clears
  filters/selection/working-set/timeline; all scoped caches invalidate).
- `WorkspacePicker` is NOT built as UI, but the orchestration exists:
  `useSwapWorkspace` (`swap(workspace, scope)`), `applyAcceptedWorkspaceSwitch`
  (workspace-level reset), the registry, and `/map?workspace=`.

### F-FILTER — One canonical filter plane, 13 facets, two consumers

- Client `GraphFilter` (`stores/server/engine.ts`) = `tiers`, `min_confidence`,
  `relations`, `structural_state`, `kinds`, `doc_types`, `feature_tags`,
  `feature_query` (glob/regex), `statuses`, `plan_tiers`, `health`
  (dangling/orphaned), `text` (substring), `date_range`. Held canonically in
  `dashboardState.filters`.
- Canonical authoring surface = the LEFT RAIL: `RailFilter` (text field → writes
  `filters.text`) plus a facet trigger that opens `FilterSidebar`/`FilterMenu`
  (KIND/TOPIC/STATUS/HEALTH). All mutations route through one
  `patchDashboardState`.
- Backend: `POST /graph/query` applies the filter (deterministic node/edge
  membership, `engine-query/filter.rs`); `GET /filters` enumerates the
  data-driven vocabulary.
- What it AFFECTS: `text` narrows BOTH the rail tree (vault stems +
  feature_tags; code paths — client-side, `filterVaultTreeEntries`) AND graph
  node visibility (`computeVisibility` → `set-visibility`). The FACET filters
  narrow the GRAPH ONLY — the rail tree currently ignores them.

### F-SEARCH — Semantic, orthogonal, three homes

- `POST /search` is a transparent rag pass-through: `{scope, query,
  target: vault|code, max_results ≤ 50}` → ranked hits `{id, path, score,
  source, doc_type, feature, date, function_name, class_name, language,
  node_id}`. No filter facets combine with it; the engine adds only the
  clickthrough `node_id`.
- Frontend: `searchController` (200 ms debounce, tiers-gated degradation, vault
  text-match fallback when rag is down), an independent `searchIntent` store
  (`query` + `target`). Result-click = node selection (stage focus), not
  filtering.
- Search currently surfaces in the RIGHT-rail `SearchTab` (being deprecated) and
  the Cmd-K `SearchPalette`. Filter and search are separate state and separate
  endpoints — they do not combine.

### F-FRAG — The fragmentation to reconcile

- F1: search has three entry points (right-rail tab, Cmd-K palette, a proposed
  left bar) with no single home.
- F2: the rail "text" input is the substring FILTER facet, not semantic search —
  but a search bar reads to users as "returns results".
- F3: the top picker shows the worktree, conflating it with the unbuilt PROJECT
  (workspace) switcher the redesign wants.
- F4: facet filters never reach the rail TREE, so the rail's own tree disagrees
  with the graph it filters.
