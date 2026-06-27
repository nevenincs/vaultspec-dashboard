---
tags:
  - '#research'
  - '#command-palette-architecture'
date: '2026-06-21'
modified: '2026-06-22'
related: []
---

# `command-palette-architecture` research: `command palette contribution architecture`

This research grounds a campaign to re-architect the dashboard's Cmd+K command
palette. The palette today is a *shell and an idea* rather than a designed surface:
its command list is hand-assembled by concatenating nine `buildX()` arrays in one
mega-hook, it is saturated with transient corpus data enrolled as if those were
real actions, it is missing most standard UI verbs (focus / show / hide / close /
reload / the navigation CRUD), and the keyboard-mapping and ops/keybinding work the
backend already started is not tied through to the palette. The campaign's thesis is
to replace the hand-rolling with a *contribution registry* that frontend providers
enroll into (mirroring the context-menu resolver registry that already exists),
structurally fence corpus data out of the command plane, complete the UI-action
taxonomy, and clarify the three distinct Cmd+K planes (command / semantic search /
document search) with one standardized open verb on result entities.

The investigation was rag-driven (`vaultspec-rag search --type code`) across the
fragmented domains — palette assembly, the action/keymap substrate, the search
controllers, the settings/ops seams — and confirmed against the source.

## Findings

### F1 — The palette is hand-assembled, not provider-fed

The read model `useCommandPaletteCommandView` in
`frontend/src/stores/view/commandPaletteCommands.ts` (the hook at ~line 772) calls
roughly fifteen stores hooks and concatenates the output of nine builder functions
into one flat list, then time-travel-gates and query-filters it:

- `buildCommands` (~163) — feature-tag navigation, lens apply, the `OPS_WHITELIST`
  verbs, open-settings, save-lens.
- `buildWindowCommands` (~244) — rail/timeline show-hide-collapse, right-rail tab
  set, reset-layout, keyboard-shortcuts.
- `buildLeftRailCommands` (~321) — new-document, browse-mode set, toggle-facets,
  collapse-tree, reset-filters (these alone already reuse the shared
  `ActionDescriptor` builders).
- `buildFeatureArchiveCommands` (~347) — one `archive feature: <tag>` per feature.
- `buildTimelineCommands` (~382), `buildEditorCommands` (~408),
  `buildGraphCommands` (~434), `buildSettingsCommands` (~493 — theme presets).

Adding a command means editing this one file and wiring another hook into the
mega-hook's dependency array. There is no contract a surface can enroll against; the
palette does not *consume* a registry the way the context menu does. This is the
"hand-rolling contents instead of programmatic population" the campaign targets.

### F2 — The corpus pollution is real and was mandated by the prior ADR

`buildCommands` emits one `nav:<feature>` ("go to <feature>") command **per feature
tag**, and `buildFeatureArchiveCommands` emits one `archive feature: <tag>` command
**per feature tag** (both bounded at `COMMAND_PALETTE_SOURCE_ITEMS_CAP = 128`). Lens
names are enrolled the same way. So the standing command list is dominated by
transient vault vocabulary — the corpus appears in the palette as first-class
"actions." The prior decision record `2026-06-14-dashboard-command-palette-adr`
mandated exactly this ("navigation contributes one entry per feature tag") and
explicitly concluded "the palette did not need re-architecting." Both stances are
what this campaign supersedes: corpus vocabulary is *data to be searched*, not a set
of standing commands, and the assembly *does* need re-architecting.

### F3 — The provider pattern the palette should mirror already exists next door

The context-menu **resolver registry** (`frontend/src/platform/actions/registry.ts`)
is precisely the contribution model the palette lacks: a pure
`(entity, ctx) => ActionDescriptor[]` resolver is registered once per entity kind,
the host stays generic and calls `resolveActions`, and the central time-travel gate
is the one cross-cutting concern applied in the pipeline. Surfaces self-register by
side-effect import, collected deterministically in
`frontend/src/app/menus/registerAll.ts`. The **keymap registry**
(`frontend/src/platform/keymap/registry.ts`) is the sibling catalog for bindable
verbs (`KeybindingDef` = id + default chord + label + group + context), turned into
live descriptors by `registerKeyAction` thunks in
`frontend/src/stores/view/keymapDispatcher.ts`. And the shared verb builders
(`frontend/src/app/menus/sharedActions.ts`,
`frontend/src/stores/view/leftRailKeybindings.ts`) already author recurring verbs
once and let every plane compose them. The `unified-action-plane` rule already names
the command palette as one of the four planes — but it is the only plane that does
not consume a registry. The campaign closes that gap with a **command-provider
registry** in the same shape: a surface contributes
`(ctx) => CommandDescriptor[]`, the palette host stays generic, and the gates
(time-travel, degradation) apply centrally.

### F4 — Three Cmd+K planes, and one standardized open verb on results

The palette store `frontend/src/stores/view/commandPalette.ts` models two modes
today: `command` (the verb plane) and `search` (the rag-backed semantic plane). The
search plane is served by `frontend/src/stores/server/searchController.ts`
(`useUnifiedSearchController` composing vault + code corpus controllers, merged and
score-ranked by `mergeUnifiedSearch`, bounded at 40) and rendered by
`frontend/src/app/palette/SearchPaletteSurface.tsx`. The campaign clarifies the
plane model into **three** distinct concerns: (1) the **command plane** (real app
verbs from providers), (2) **semantic search** (rag, meaning-ranked — stays), and
(3) a new **document search** (literal name/title finder — the corpus-navigation
the palette flood was poorly approximating). Critically, "go to / open" is not a
per-feature command — it is **one action performed on a result entity**, and it must
be standardized across every edge. The canonical open seam already exists:
`openNodeIsland` / `selectNode` in `frontend/src/stores/view/selection.ts` is the
same click-through the graph, the search results, and the context-menu resolvers
use. The campaign makes the search result an `EntityDescriptor` and the open verb a
single shared `ActionDescriptor`, so opening a result, right-clicking a node, and
clicking a graph node all run the identical verb (the `unified-action-plane` applied
to results).

### F5 — UI-action coverage is partial and ad hoc

Enrolled today (palette and/or keymap): new-document, browse-mode, toggle-facets,
collapse-tree, reset-filters, rail/timeline show-hide-collapse, right-rail tab set,
reset-layout, graph fit/zoom/freeze/reset, timeline jump/fit/range, close-document,
theme presets, the `OPS_WHITELIST` verbs. Notably **absent** from the palette/keymap
despite having live handlers elsewhere: focus-node / focus-filter-field /
clear-filter, expand-tree (needs the live key set), pin/unpin and focus and
open-island (context-menu only), save-body / rename-document / edit-mode-toggle
(editor-component-coupled), reveal-in-file-manager and open-in-editor and
copy-path/id (context-menu only), neighbor-cycle / feature-cycle (keybinding only),
reindex/watcher control beyond the four whitelisted verbs, and the full settings
surface (only theme is reachable). The taxonomy the campaign must complete is the
standard set: **navigate, window, focus, CRUD, reload/refresh, settings, search,
help** — every surface enrolling its verbs into the one registry, with keyboard
mappings derived from the same registry so the legend cannot drift.

### F6 — The backend already started shortcuts + actions; the palette completes it

The backend's contribution is consolidated, not extended (the chosen direction):
the engine `keybindings` setting (`engine/crates/vaultspec-session/src/settings_schema.rs`,
a bounded sparse `{action_id: chord}` override map, max 256, validated server-side)
already persists the customization, and the frontend keymap registry owns the
canonical action-id catalog and default chords. Operational verbs reach the palette
through `OPS_WHITELIST` (`frontend/src/stores/server/opsActions.ts`) dispatched via
the `appDispatcher` seam (the `palette-ops-dispatch-through-the-seam` candidate
rule). The decided architecture keeps the **catalog frontend-owned**: the backend
feeds *verbs* (ops/rag control surface, the persisted keybinding overrides) through
the existing `/ops` and settings wires, and no new engine endpoint is introduced
(honoring `engine-read-and-infer`). "Tying it together" means: a `reload/refresh`
command family backed by the existing rag-control + engine ops verbs, the keybinding
overrides surfaced on every palette command's inline shortcut, and the ops/rag verbs
contributed as a provider rather than a hard-coded whitelist branch in
`buildCommands`.

### F7 — Adjacency to the in-flight keyboard-navigation campaign

The same-day `2026-06-21-keyboard-navigation-adr` is the *focus spine* (Tab / F6 /
`FocusZone` / region cycling — Class-B widget navigation and inter-region traversal).
It is adjacent, not overlapping: it governs how focus *moves*, this campaign governs
what *commands* exist and how they are *contributed*. Both bind into the same keymap
registry and `ActionDescriptor` plane, so the campaigns must not both grow private
global listeners or duplicate registry entries — coordination point, not collision.

## Design space for the contribution registry

- **Shape.** A `CommandProvider = (ctx: CommandContext) => CommandDescriptor[]`
  registered once per surface, mirroring the resolver registry. The palette host
  calls a generic `resolveCommands(ctx)`; providers are pure and unit-testable; the
  central gates (time-travel, degradation-from-tiers, query filter) apply in the
  host, not per provider.
- **Descriptor.** A `CommandDescriptor` is the existing `ActionDescriptor` plus the
  palette `family` grouping — the same generalization already encoded by
  `PaletteCommand`. Keybinding association is by shared `id` with the keymap
  registry, so the inline shortcut is derived, never hand-typed.
- **Corpus fence.** A structural guard (mirroring
  `filterConsolidation.guard.test.ts`) asserts no provider enrolls a per-document /
  per-feature / per-lens entry into the command plane; corpus navigation lives only
  in the document-search plane.
- **Bounded by default.** The provider list, any recents/MRU set, and the merged
  search list carry explicit caps at creation
  (`bounded-by-default-for-every-accumulator`).

## Open questions for the ADR cluster

1. Provider registry granularity: one provider per surface vs one per family.
2. Document-search backend: reuse the rag literal/sparse half, or a separate
   name-index over the vault tree the engine already serves.
3. Whether the ops/rag verbs become a backend-fed provider manifest surfaced through
   `/ops`, or stay a frontend constant the provider wraps (the chosen "backend feeds
   verbs only" direction leans to the latter).
4. Recents/MRU: whether a bounded recently-used command + recently-opened document
   set is in scope for v1.

## Prior art and governing rules

VS Code's "contributed commands / when-clauses / contributed menus" is the
acknowledged model (the resolver registry already adapts it). Governing project
rules: `unified-action-plane`,
`keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`dashboard-layer-ownership`, `views-are-projections-of-one-model`,
`bounded-by-default-for-every-accumulator`, `ui-labels-are-user-facing`,
`settings-are-schema-driven-from-one-registry`, and the candidate
`palette-ops-dispatch-through-the-seam`. Superseded in part:
`2026-06-14-dashboard-command-palette-adr` (per-feature nav, no-re-architecting).
