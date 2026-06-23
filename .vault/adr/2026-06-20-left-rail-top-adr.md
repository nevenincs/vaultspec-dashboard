---
tags:
  - '#adr'
  - '#left-rail-top'
date: '2026-06-20'
modified: '2026-06-23'
related:
  - '[[2026-06-20-left-rail-top-research]]'
  - '[[2026-06-14-dashboard-workspace-registry-adr]]'
  - '[[2026-06-14-dashboard-left-rail-adr]]'
---



# `left-rail-top` adr: `Left rail top: project picker, global search, and filter reconciliation` | (**status:** `accepted`)

REITERATED 2026-06-22 (user direction): D2 and D6 are corrected below. The rail
search bar is a FEATURE filter with a feature-name autocomplete; it does NOT escalate
to semantic search. Semantic search lives ONLY in the Cmd-K palette. The advanced,
granular facets live behind the button beside the search bar (D3).

## Problem Statement

The left rail's top area carries three intertwined concerns — project/worktree
selection, project-wide search, and fine-tuned filtering — that have accreted
across cycles with duplicated and fragmented requirements (research
`2026-06-20-left-rail-top-research`, finding F-FRAG): search has three entry
points with no single home; the rail "text" input is an overloaded substring
filter that users misread as a results-returning search; the top picker shows
the worktree while the project (workspace) switcher the redesign wants is
unbuilt; and the rail tree ignores its own facet filters. This ADR reconciles
the top area into one coherent contract, grounded in the actual backend and
frontend rather than intent.

## Considerations

- The grounded reality (research): a `scope` is a worktree path; a `project` is
  a registered workspace root; the 13-facet `GraphFilter` plane is canonical to
  the rail; semantic `/search` is orthogonal to filtering; search is scattered
  across the right-rail `SearchTab`, the Cmd-K `SearchPalette`, and a proposed
  rail bar.
- Standing rules: `filtering-has-one-canonical-surface` (the rail is the one
  filter surface; semantic search is a distinct pillar), `dashboard-layer-
  ownership` (stores is the sole wire client), `views-are-projections-of-one-
  model`, and `keyboard-shortcuts-bind-through-the-one-keymap-registry`.
- The user's design intent: a top project-switcher row (plain title + a
  right-aligned folder-pick button), then a global search bar wedged between the
  picker and the tabs and bracketed by two separators, then the Vault|Files
  switcher.

## Constraints

- The backend is fixed and SUFFICIENT: `/search` (rag, target `vault|code`),
  `/graph/query` (filter), `/filters` (vocabulary), `/map` + the workspace
  registry + `useSwapWorkspace` all already exist. No new engine endpoint is
  required; the reconciliation is frontend composition plus ONE tree-filter
  extension.
- Filter (structural) and search (semantic) cannot combine in a single backend
  call — their union is a UI affordance, never a wire merge.
- Scope and workspace switches are wholesale resets; the picker MUST route
  through the existing reset orchestration (`activateWorktreeScope`,
  `swapWorkspace`), not invent state.

## Implementation

The top area is one vertical stack, top → bottom:
`[Project switcher row] — separator — [Search bar] — separator —
[Vault|Files tabs] — [tree body]`.

**D1 — The top row is a PROJECT switcher (build `WorkspacePicker`).** It renders
the current project (workspace) display name as a plain TITLE (no background, no
pill), left-aligned. A right-aligned folder-pick icon button on the SAME row
opens the folder picker to register/open a NEW project root, routed through
`useSwapWorkspace` + the workspace registry; acceptance performs the
workspace-level wholesale reset. Clicking the title opens the project → worktree
chooser (registry roots, each expandable to its vault-bearing worktrees), so
switching project AND worktree both live here via `activateWorktreeScope` /
`swapWorkspace` — no new reset logic. The worktree name appears as a secondary
cue only when a project has more than one worktree.

**D2 — The search bar is a FEATURE filter (reiterated 2026-06-22).** TYPE → live
FILTER by feature: keystrokes drive the canonical `feature_query` (substring, glob
`name-*`, regex `/…/`) over feature tags, narrowing the rail tree and projecting to
graph visibility, with no fetch. A dropdown autocompletes FEATURE-NAME candidates to
complete the filter. The bar does NOT search document titles/content and does NOT
escalate to semantic search — there is no Enter→search on the rail. The placeholder
is "Filter by feature…".

**D3 — Fine-tuned facets hang off the search row.** A facet trigger on the
search row opens the centralized `FilterMenu` flyout (KIND/TOPIC/STATUS/HEALTH/
date), writing `dashboardState.filters` and preserving the one canonical filter
surface; an active-count badge shows applied facets.

**D4 — The Vault|Files switcher is the corpus selector for BOTH planes.** The
active tab sets the search `target` (`vault|code`) AND the tree/filter corpus,
keeping picker, search, and filter coherent.

**D5 — The rail tree honours facets, not just text (the one genuinely new piece
of plumbing).** Extend rail-tree narrowing so the vault/code tree obeys the
facet filters (`doc_types`, `statuses`, `health`, `feature_tags`), not only
`text`, so the rail tree agrees with the graph it filters (closes F4).

**D6 — Semantic search is the Cmd-K palette ONLY (reiterated 2026-06-22).**
Semantic `/search` (rag) results live exclusively in the shared `SearchPalette`
reached via Cmd-K — never from the rail search bar. The right-rail `SearchTab`
stays retired. The rail filter plane (structural: feature filter + facets) and the
semantic-search plane (Cmd-K) are distinct surfaces, not one escalating bar.

Out of scope / preserved: the engine wire is unchanged; all scope/workspace
switching reuses the existing reset orchestration; the Figma prototypes already
built (the `WorkspacePicker` node, `LeftRail/Row`, `LeftRail/DocRow`,
`LeftRail/SectionBody`, the Vault|Files tabs) realize this contract visually.

## Rationale

The decisions follow directly from the grounded findings: F-SCOPE shows the
project switcher is unbuilt but fully orchestrated, so D1 is composition not new
state; F-FILTER shows one canonical 13-facet plane the rail already authors, so
D2/D3 keep that plane and merely add the semantic-search escalation the users
expect; F-SEARCH shows search is orthogonal and already scattered, so D6
collapses it to one entry + one results surface; F-FRAG/F4 names the only real
gap — the tree ignoring facets — which D5 closes. The reconciliation honours
`filtering-has-one-canonical-surface` (filter stays rail-authored) while giving
semantic search its single home, and requires NO backend change.

## Consequences

Gains: one discoverable search/filter entry; a real project switcher built on
proven orchestration; the rail tree and graph finally agree under facets. Costs:
retiring `SearchTab`, building the `WorkspacePicker` UI, and the tree-facet
plumbing (D5). Pitfalls: the type-vs-Enter duality must be discoverable (the
placeholder and an explicit affordance carry it); the local-filter vs
global-search mental model must stay legible so users know when they are
narrowing the current corpus versus searching everything.

## Codification candidates

- **Rule slug:** `rail-search-is-a-feature-filter-semantic-is-cmd-k`.
  **Rule:** the rail search bar is a FEATURE filter (the `feature_query` facet,
  with a feature-name autocomplete) that narrows the active corpus locally with no
  fetch; it NEVER escalates to semantic search and has no Enter→search. Semantic
  `/search` results live ONLY in the Cmd-K palette. The rail filter plane
  (feature filter + the advanced facets behind the button) and the semantic-search
  plane (Cmd-K) are distinct surfaces, never one escalating bar. (Reiterated
  2026-06-22; candidate, promote only after it holds across an execution cycle.)
