---
tags:
  - '#adr'
  - '#left-rail-tree-controls'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - "[[2026-07-03-left-rail-tree-controls-research]]"
  - '[[2026-06-14-dashboard-sidebar-adr]]'
  - '[[2026-06-14-dashboard-left-rail-adr]]'
  - '[[2026-06-20-left-rail-top-adr]]'
  - '[[2026-06-15-dashboard-context-menus-adr]]'
  - '[[2026-06-21-command-palette-actions-adr]]'
  - '[[2026-06-22-unified-filter-plane-adr]]'
---

# `left-rail-tree-controls` adr: `the left rail as a review surface: signals, sorting, reset verbs, indent guides` | (**status:** `accepted`)

## Problem Statement

The left rail's vault tree renders documents as bare title rows with one mtime
label. An operator (or agent) reviewing project state cannot read from the
tree: when a document was authored (the filename's date stamp is sanitized out
of the display title and nothing replaces it), whether an ADR is accepted or
still proposed, whether a plan is untouched / in flight / complete, or how
substantial a document is (no size or length signal exists anywhere in the
system). The tree also imposes one hardcoded order (features by member count,
documents newest-modified-first) with no user sorting, carries no
sorting/filter reset verbs on its own context menus even though the actions
exist in the keymap and palette, and draws no vertical indent guides, so deep
nesting is hard to scan. This ADR decides how the rail becomes a review
surface — grounded in the `left-rail-tree-controls` research, which
established that every signal except size/length is ALREADY served by
`/vault-tree` and adapted into `VaultTreeEntry`, just never rendered.

## Considerations

- **The wire is ahead of the UI.** `build_vault_tree_rows` serves `status`
  (ADR H1 acceptance), `tier` (plan L1–L4), `progress` (plan checkbox
  done/total via `lifecycle_in_scope`), and all three dates (`created` =
  frontmatter date = the filename stamp; `stamped` = CLI `modified:` stamp;
  `modified` = worktree mtime). The tolerant adapter keeps them all. The
  plan-status pip helpers (`planStatus`, `planStatusMark`,
  `planStatusToneClass`) already exist behind a stale honesty note.
- **Wire-contract rule:** displayed/filterable state is backend-served. The
  only missing signals — file size and markdown length — must therefore be
  engine-computed at ingest and served, never derived client-side.
- **Filter vs presentation (standing rule):** sorting changes how one view
  renders the same corpus; it is view-local presentation and must never touch
  `dashboardState.filters`. The persisted view-local pattern is the
  `browserTreeExpansion` / `browserMode` stores.
- **One descriptor across planes (standing rule):** every new verb (sort
  options, reset sorting) and every existing reset verb is one
  `ActionDescriptor` enrolled where eligible — context menu, palette, keymap —
  never a bespoke per-surface handler.
- **Figma is binding:** indent guides and row-signal layout change the
  `LeftRail` component's look; the divergence is recorded here as a deliberate
  decision and the Figma component is updated to match (code and design move
  together; this ADR is the record).
- **User direction (2026-07-04):** deliver the review surface; the code tree
  keeps a fixed VS Code-style order (directories first, then files,
  alphabetical) with no sort control.

## Considered options

- **O1 — Frontend-derived signals** (compute size/status client-side from
  content fetches): rejected — violates the wire-contract rule and would need
  N content fetches for a listing the engine already scans at ingest.
- **O2 — Engine-served signals + view-local sort (chosen):** render the
  already-served facets; add ONE additive wire extension (size + word count)
  computed at ingest; sort as persisted view-local state applied inside the
  existing projection.
- **O3 — Backend-persisted sort in dashboard-state:** rejected — sort is
  presentation, not shared dashboard intent; persisting it in the backend
  record would drag every surface into lock-step reordering and contradict
  the filter-vs-presentation split.
- **O4 — Sort as an engine query parameter:** rejected — the rail already
  holds the complete vault listing client-side; re-fetching per sort key adds
  wire round-trips for a pure re-projection of held data.

## Constraints

- The `/vault-tree` extension must be additive and optional: an older engine
  omits the field, the tolerant adapter yields `undefined`, and the rail
  degrades to today's rows (no size meta, size sort unavailable). No
  stable-key change — size/length are volatile facts, never identity.
- Word counting at ingest must stay O(bytes) on the already-read body — no
  second file read, no markdown parse; the ingest path is the
  worktree-parse-performance hot path.
- Sort must reuse `deriveVaultRailView` (one projection) — never a second
  per-component sort — and preserve today's order as the default so existing
  muscle memory and tests survive.
- All new UI values ride tokens and rem (no-hardcoded-px); labels are plain
  language (never wire tokens like `L2` alone or `doc_type` names raw).
- Context-menu verbs live on exactly one layer; the reset verbs join the
  bespoke `vault-section` resolver only.

## Implementation

**D1 — Review signals on rows (presentation only).** A document leaf renders:
the authored date (`dates.created`) as the trailing date meta by default,
switching to the active sort key's date when a date sort is chosen; an ADR
leaf adds its acceptance status as a quiet status token (Proposed / Accepted /
Rejected / Deprecated — plain-language labels, state-token ink, no new
primitive); a plan leaf adds the existing plan-status pip (complete /
in-progress / not-started from served `progress`) plus a tabular `done/total`
count, and its tier rendered as plain language ("Tier 2"). The row tooltip
(`title`) grows from bare path to path + authored/stamped/modified dates +
size, so hover is the full metadata card. The stale honesty note in
`vaultRowPresentation.ts` is deleted with the wiring. Feature folder rows
aggregate nothing new (their member count already reads).

**D2 — Size and length on the wire (the one engine change).** At ingest,
where the document body is already in memory, compute `size_bytes` (byte
length) and `word_count` (whitespace-split count, O(bytes), no markdown
parse); carry them on the document `Node` as an optional facet in the `dates`
class and emit them on `/vault-tree` rows as `size: { bytes, words }`. The
adapter validates non-negative integers and drops malformed values. The rail
renders a compact human label ("1.2k words" primary, bytes in the tooltip) in
quiet meta ink. Absent size (older engine, historical view) renders nothing —
honest absence, no zero.

**D3 — The vault sort plane (view-local, persisted).** A new
`frontend/src/stores/view/railSort.ts` store holds `{ key: "recency" |
"name" | "created" | "modified" | "size", direction: "asc" | "desc" }`,
default `recency/desc` (exactly today's behaviour), persisted like
`browserMode`, reset on workspace swap with the other view-local rail state.
`deriveVaultRailView` accepts the sort and applies it to document lists
inside category folders AND to the feature-folder order (name and date keys
apply to folders by their newest member; size by summed members), so one sort
concept governs the whole tree. Controls: one compact sort button in the rail
top beside the filter field opening a small menu (the left-rail-top band
already hosts the filter affordances); the same options enrolled as
`vault-section` context-menu items and palette commands from one shared
descriptor per option (`left-rail:sort-*` ids); no per-mode drift — Files
(code) mode renders no sort control and keeps the engine's fixed
directories-first alphabetical order.

**D4 — Reset verbs reach the rail's own menus.** The existing
`resetFiltersAction`, `clearFilterAction`, and `toggleFacetsAction` builders
enroll in the `vault-section` resolver (same ids, same builders — composition
only), joined by a new `left-rail:reset-sorting` descriptor (restores
`recency/desc`) enrolled in the same menu, the palette, and available to the
keymap. The section menu thus reads: expand/collapse, sorting, filter
reset/facets, new document.

**D5 — Indent guide lines.** Every expanded folder body draws a 1px vertical
guide in faint border ink aligned under its parent's chevron column — the
standard tree-view guide (VS Code's pattern) — implemented on the existing
`[data-vault-folder-body]` wrapper as a `border-inline-start` (or equivalent
background line) offset in rem via the same `INDENT_BASE_REM + level *
INDENT_STEP_REM` math the rows use, token-colored, theme-aware, no px. Guides
are always-on (a review surface reads structure at a glance); the selected
row's rounded fill and the guides never overlap because the guide sits in the
indent gutter. The Figma `LeftRail` component is updated to carry the guides
and the row-signal layout so the binding stays true; this ADR records the
transition window where code lands first.

## Rationale

The research (F8–F10) showed the review-surface gap is almost entirely a
rendering gap: the engine and adapter already carry acceptance status, plan
tier, checkbox progress, and all three date semantics; only size/length is a
true wire gap, and it lands exactly where the wire-contract rule wants it
(ingest-computed, engine-served, additively). Sorting lands as view-local
presentation because the filtering rule's split is explicit — a sort narrows
nothing. Reset verbs were already authored once as shared builders; enrolling
them in the section menu is the unified-action-plane rule working as
designed. Indent guides are the one deliberate design-binding change, and the
smallest: one token-colored line per folder body, recorded here per the
design-system rule.

## Consequences

- The rail becomes glanceable state: authored date, acceptance, plan
  progress, and document weight readable without opening anything — the
  signals agents and reviewers were reconstructing by hand.
- One additive wire field (`size`) enters contract §4; ingest gains an
  O(bytes) word count on a body it already holds — negligible against the
  parse it accompanies, but it IS new per-document work the perf sweep should
  watch.
- Rows carry more trailing meta; on narrow rails the truncation order must
  keep the title first — a density risk the Figma update must resolve, and a
  reason meta stays quiet ink, not chips.
- The sort plane adds a persisted view store and a projection parameter —
  more state, but in the established pattern with one reset path.
- The Figma `LeftRail` component temporarily lags code (guides + signals);
  this ADR is the recorded divergence until the component update lands.
- Historical/as-of views may lack `modified`/size honestly; every renderer
  treats absence as absence.
