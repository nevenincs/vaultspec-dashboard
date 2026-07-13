---
tags:
  - '#research'
  - '#left-rail-tree-controls'
date: '2026-07-03'
modified: '2026-07-12'
related:
  - '[[2026-06-14-dashboard-sidebar-adr]]'
  - '[[2026-06-14-dashboard-left-rail-adr]]'
  - '[[2026-06-20-left-rail-top-adr]]'
  - '[[2026-06-15-dashboard-context-menus-adr]]'
  - '[[2026-06-23-background-context-menus-adr]]'
  - '[[2026-06-21-command-palette-actions-adr]]'
  - '[[2026-06-22-unified-filter-plane-adr]]'
  - '[[2026-06-24-left-rail-feature-filter-adr]]'
---

# `left-rail-tree-controls` research: `tree metadata, sorting, reset actions, and indent guides`

The left rail's vault/code trees were reported missing standard file-browser
capabilities: no visible created date, no user-controlled sorting (name /
created / modified), no sorting-and-filter reset verbs on the rail's own
surfaces (context menus), and no tree-view vertical indent guide lines. This
research grounds each gap in the current implementation and the governing
decisions, and sketches closure options for the ADR.

## Findings

### F1 — Current implementation map

Vault mode is `frontend/src/app/left/TreeBrowser.tsx`: two collapsible
sections (Features, Documents) over the one `/vault-tree` projection, every
level rendered through the single `VaultTreeRow` shell. Indentation is
`padding-inline-start` only (`INDENT_BASE_REM 0.5` + `INDENT_STEP_REM 1` per
level, `TreeBrowser.tsx:121-125`) — there is no vertical guide element at any
indent step. Files mode is `frontend/src/app/left/CodeTree.tsx`. Row
presentation helpers (marks, labels, date formatting) are centralized in
`frontend/src/app/left/vaultRowPresentation.ts`. The projection that shapes
the tree is `deriveVaultRailView` in `frontend/src/stores/server/queries.ts:1986`.

### F2 — Created/modified dates are already served; only `modified` is shown

`VaultTreeEntry.dates` carries `created`, `modified`, and `stamped`, all
normalized to day-granular ISO strings by the tolerant adapter
(`frontend/src/stores/server/engine.ts:269-282`; the adapter comment states
every entry carries all three after adaptation). The document leaf renders
only `dates.modified` as trailing meta (`TreeBrowser.tsx:969`, via
`docDateLabel` in `vaultRowPresentation.ts:225`). Showing the created date is
therefore pure presentation work — zero engine change — and stays inside the
wire-contract rule (the value is backend-served, the frontend only formats).
The rail also already knows the ACTIVE date criterion: `useVaultRailFacets`
derives `dateField: "created" | "modified" | "stamped"`
(`queries.ts:2016-2035`), the same field the timeline and engine narrow by, so
the leaf meta could follow that criterion instead of hardcoding `modified`.

### F3 — Sort order is hardcoded; a sort plane is absent

`deriveVaultRailView` fixes the order: feature folders sort count-desc then
name (`queries.ts:1991-1993`); documents inside every category folder sort
newest-modified-first with a path tiebreak (`compareVaultRecency`,
`queries.ts:1878-1883`). No surface offers name / created / modified sorting,
no direction toggle, no reset-to-default. Classification under the standing
rules: a sort control changes how one view renders the same corpus — it is
presentation, NOT a corpus filter — so it must be view-local and never touch
`dashboardState.filters` (filter-vs-presentation split in the filtering rule).
The established pattern for persisted view-local rail chrome is the
`browserTreeExpansion` store and `browserMode` store in
`frontend/src/stores/view/` (persisted, scope-keyed, one reset path on scope
swap); a `railSort` store would follow it. The sort itself belongs in the
existing projection (`deriveVaultRailView` takes the sort as an argument),
never a second per-component sort.

### F4 — Reset verbs already exist as shared builders but are not enrolled in the rail menus

`frontend/src/stores/view/leftRailKeybindings.ts` already authors the shared
action builders with keymap chords and palette enrollment:
`resetFiltersAction` (`left-rail:reset-filters`, Mod+Alt+0, clears the
canonical `dashboardState.filters`), `clearFilterAction`
(`left-rail:clear-filter`, Mod+Shift+X, clears the feature-filter draft), and
`toggleFacetsAction` (`left-rail:toggle-facets`, Mod+Shift+L). They are
reachable from the keymap and Cmd+K, but NO rail context menu carries them:
the vault-section menu offers only expand-all / collapse-all / new-document
(`frontend/src/app/left/menus/vaultSectionMenu.ts:38-42`). Closing this gap is
composition only — enroll the existing builders (same action ids) into the
section resolver per the one-descriptor-across-planes rule; no new handler may
be authored. New sort verbs would ride the same builder pattern (menu +
palette + optional chord from one `ActionDescriptor`).

### F5 — Context-menu layering constrains where the new verbs go

Per the context-menus decisions and the actions-keymap-palette rule, a verb
lives on exactly one of three layers. Sort and reset verbs scoped to the tree
belong on the bespoke per-kind resolvers (`vault-section` for tree-wide sort/
reset; possibly `vault-category` for per-folder concerns), never duplicated
into the global tail (capped at Refresh) or the background menu. The
per-kind resolvers self-register at module load (`TreeBrowser.tsx:96-99`), so
new verbs are additions inside existing resolver modules, not new layers.

### F6 — Indent guide lines are a design-binding change, not just CSS

The binding Figma `LeftRail` component (file `SlhonORmySdoSMTQgDWw3w`)
specifies the current look: fully-rounded rows, staircase indent, color only
on parent rows — and no vertical indent guides (the `TreeBrowser.tsx` header
comments restate the binding). Under the design-system rule Figma wins:
adding standard tree guides requires either updating the Figma `LeftRail`
component first (preferred; code then mirrors it) or an ADR recording the
divergence. Implementation shape once decided: a guide element per expanded
folder body (`[data-vault-folder-body]` wrapper already exists,
`TreeBrowser.tsx:691`) — a 1px `border-inline-start` (or background line)
aligned to the parent's chevron column at `INDENT_BASE_REM + level *
INDENT_STEP_REM` rem offsets, colored with a faint border/ink token, all rem
(no-hardcoded-px). Interaction detail to decide in the ADR: guides always-on
vs. active-path emphasis, and whether `prefers-reduced-motion`/high-contrast
remaps need a token check.

### F7 — Files (code) tree keeps a fixed VS Code-style order (user direction)

`CodeTree.tsx` renders the worktree directory hierarchy with lazy expansion
over the engine's already-sorted `/file-tree` children. User direction
(2026-07-04): the code tree gets NO sort control — it keeps the conventional
editor ordering (directories first, then files, alphabetical — what VS Code
implements). The sort plane is Vault-mode only.

### F8 — The review signals are ALREADY on the wire and adapted, just never rendered

The rail was reported unable to signal document state; grounding shows the
engine already serves — and the tolerant adapter already keeps — everything
except size/length. `build_vault_tree_rows`
(`engine/crates/engine-query/src/graph.rs:510`) emits per row: `status` (ADR
H1 acceptance status: proposed / accepted / rejected / deprecated), `tier`
(plan `L1`–`L4`), and `progress` (plan checkbox `done`/`total` from the same
`lifecycle_in_scope` facet the graph reads). `adaptVaultTreeEntry`
(`frontend/src/stores/server/liveAdapters.ts:1076-1099`) validates and keeps
all three, and `VaultTreeEntry` declares them (`engine.ts:283-292`). NOTHING
in `TreeBrowser.tsx` renders them. The plan-status pip helpers already exist
(`planStatus` / `planStatusMark` / `planStatusToneClass` in
`vaultRowPresentation.ts:137-181`) behind a now-STALE honesty note claiming
progress "is not carried on the `/vault-tree` `VaultTreeEntry`" — the
dashboard-pipeline-wire work landed it since. Rendering ADR status, plan tier,
and plan progress is therefore pure presentation work, and the wire-contract
rule is satisfied (all displayed state is engine-served).

### F9 — Date semantics: the "filename stamp" is the served `created` date

Three served dates, three meanings (`engine-query/src/filter.rs:137-143`):
`created` = the frontmatter `date:` (which equals the filename's `yyyy-mm-dd`
stamp by the vault naming convention), `stamped` = the CLI-maintained
frontmatter `modified:` stamp, `modified` = worktree mtime. The rail's title
derivation (`docDisplayTitle`, `vaultRowPresentation.ts:241`) strips the
`yyyy-mm-dd-` prefix for readability and the row then shows ONLY the mtime —
so the authored date the filename carries is sanitized away with no
replacement. Restoring it means rendering `dates.created` (already served),
not un-sanitizing the title.

### F10 — Size and document length are the ONE genuine wire gap

No size/length signal exists anywhere: the engine `Node`
(`engine/crates/engine-model/src/lib.rs:252`) carries no byte size, word
count, or line count, and `/vault-tree` rows serve none. Under the
wire-contract rule (displayed/filterable state is backend-served, never
frontend-derived) these must be computed at ingest — where the document body
is already read (`ingest_struct::reader`) — and served as a new row facet in
the same class as `dates`. This is a contract §4-class extension: additive,
optional field, tolerant-adapter absorbed; a stable-key non-event (size is
not identity). Agent/user value: a 40-line stub ADR and a 900-line plan read
very differently in review.

## Proposed closure (for the ADR to decide)

The framing goal (user direction 2026-07-04): the left rail must be a
REVIEW surface — an operator or agent should read document state and signals
from the tree itself, not open each document to learn it.

- **D-signals**: render the already-served state on leaf rows — the ADR
  acceptance status, the plan tier and checkbox-progress pip (existing
  `planStatusMark` helpers; delete the stale honesty note), and the authored
  `created` date. Presentation only; zero engine work.
- **D-metadata**: leaf trailing meta follows the active `dateField` criterion
  (created default) or the active sort key when a date sort is chosen; full
  dates (created + stamped + modified) surface in the row tooltip.
- **D-size**: extend the `/vault-tree` row with ingest-computed size (bytes)
  and markdown length (word count); additive optional wire field, tolerant
  adapter, quiet trailing/tooltip meta and a size sort key.
- **D-sort**: a view-local persisted sort store (`name | created | modified |
  size`, asc/desc, default = current recency behaviour) consumed by
  `deriveVaultRailView`; control surfaces = a rail-top sort affordance beside
  the filter field (left-rail-top ADR governs that band), vault-section
  context-menu items, palette commands — all from one descriptor per option.
  Files (code) mode: NO sort control; fixed VS Code-style order.
- **D-reset**: enroll the existing `resetFiltersAction` / `clearFilterAction`
  / `toggleFacetsAction` builders into the vault-section menu; add a
  "Reset sorting" verb alongside once D-sort exists.
- **D-guides**: update the Figma `LeftRail` binding to add indent guides, then
  mirror in code via the folder-body wrapper with token-colored rem-aligned
  lines.

## Sources

- `frontend/src/app/left/TreeBrowser.tsx:121-125,691,969` — indent, folder body, leaf meta
- `frontend/src/app/left/vaultRowPresentation.ts:225-231` — `docDateLabel`
- `frontend/src/stores/server/engine.ts:269-284` — `VaultTreeEntry.dates` wire shape
- `frontend/src/stores/server/queries.ts:1878-1883,1986-2035` — recency sort, `deriveVaultRailView`, `useVaultRailFacets`
- `frontend/src/stores/view/leftRailKeybindings.ts:34-45,177-213` — existing reset/clear/toggle builders and chords
- `frontend/src/app/left/menus/vaultSectionMenu.ts:38-42` — current section-menu verb set
- `frontend/src/app/left/menus/vaultDocMenu.ts`, `vaultCategoryMenu.ts`, `vaultFeatureMenu.ts` — per-kind resolver inventory
- `engine/crates/engine-query/src/graph.rs:510-547` — `build_vault_tree_rows` (status/tier/progress served)
- `engine/crates/engine-query/src/filter.rs:137-143` — created/stamped/modified semantics
- `engine/crates/engine-model/src/lib.rs:252-284` — `Node` (no size/length field)
- `frontend/src/stores/server/liveAdapters.ts:1046-1110` — tolerant vault-tree adapter
- Figma file `SlhonORmySdoSMTQgDWw3w` — binding `LeftRail` component (no guides today)
