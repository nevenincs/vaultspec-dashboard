---
tags:
  - '#plan'
  - '#action-surface-mapping'
date: '2026-06-22'
modified: '2026-06-22'
tier: L3
related:
  - '[[2026-06-21-command-palette-actions-adr]]'
  - '[[2026-06-19-keyboard-action-system-adr]]'
  - '[[2026-06-15-dashboard-context-menus-adr]]'
  - '[[2026-06-21-command-palette-planes-adr]]'
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
     Replace action-surface-mapping with a kebab-case feature tag, e.g. #foo-bar.
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

# `action-surface-mapping` plan

## Wave `W01` - Keyboard shortcuts surface

Map every UI element's verbs onto the keymap registry and dispatcher: each element in each domain gets its applicable command chords, derived from the registry, with no surface owning a private key listener. Parity domains mirror W02 and W03 exactly.

<!-- One-line headline summary plan. -->

### Phase `W01.P01` - Global chrome domain

Ground then enroll the global chrome elements (command palette, window layout, settings, theme, help legend) on this surface.

- [x] `W01.P01.S01` - Ground the keyboard coverage of the Global chrome elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P01.S02` - Enroll the command palette verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W01.P01.S03` - Enroll the window layout verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/shellLayout.ts`.
- [x] `W01.P01.S04` - Enroll the settings dialog verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/settings/SettingsDialog.tsx`.
- [x] `W01.P01.S05` - Enroll the theme verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/server/themeSettingIntent.ts`.
- [x] `W01.P01.S06` - Enroll the help legend verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/keyboardShortcuts.ts`.

### Phase `W01.P02` - Left rail domain

Ground then enroll the left-rail elements (workspace, worktree, vault-doc, code-file, filter facets, browser mode, tree disclosure) on this surface.

- [x] `W01.P02.S07` - Ground the keyboard coverage of the Left rail elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P02.S08` - Enroll the workspace verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/left/menus/workspaceMenu.ts`.
- [x] `W01.P02.S09` - Enroll the worktree verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/left/menus/worktreeMenu.ts`.
- [x] `W01.P02.S10` - Enroll the vault-doc verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/left/menus/vaultDocMenu.ts`.
- [x] `W01.P02.S11` - Enroll the code-file verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/left/menus/codeFileMenu.ts`.
- [x] `W01.P02.S12` - Enroll the filter facets verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/filterSidebar.ts`.
- [x] `W01.P02.S13` - Enroll the browser mode verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/browserMode.ts`.
- [x] `W01.P02.S14` - Enroll the tree disclosure verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/browserTreeExpansion.ts`.

### Phase `W01.P03` - Graph stage domain

Ground then enroll the graph-stage elements (node, edge, meta-edge, island, canvas, graph controls) on this surface.

- [x] `W01.P03.S15` - Ground the keyboard coverage of the Graph stage elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P03.S16` - Enroll the node verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W01.P03.S17` - Enroll the edge verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/right/menus/edgeMenu.ts`.
- [x] `W01.P03.S18` - Enroll the meta-edge verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/stage/menus/metaEdgeMenu.ts`.
- [x] `W01.P03.S19` - Enroll the island verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/islands/menus/islandMenu.ts`.
- [x] `W01.P03.S20` - Enroll the canvas verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/stage/menus/canvasMenu.ts`.
- [x] `W01.P03.S21` - Enroll the graph controls verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/graphCommands.ts`.

### Phase `W01.P04` - Timeline domain

Ground then enroll the timeline elements (event, playhead, range, mode) on this surface.

- [x] `W01.P04.S22` - Ground the keyboard coverage of the Timeline elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P04.S23` - Enroll the event mark verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/timeline/menus/eventMarkMenu.ts`.
- [x] `W01.P04.S24` - Enroll the playhead verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/timelineIntent.ts`.
- [x] `W01.P04.S25` - Enroll the range verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/timeline.ts`.
- [x] `W01.P04.S26` - Enroll the mode verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/timeline.ts`.

### Phase `W01.P05` - Right rail domain

Ground then enroll the right-rail elements (change, search-result, commit/PR) on this surface.

- [x] `W01.P05.S27` - Ground the keyboard coverage of the Right rail elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P05.S28` - Enroll the change verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `W01.P05.S29` - Enroll the search result verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/right/menus/searchResultMenu.ts`.
- [x] `W01.P05.S30` - Enroll the commit and PR verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/right/StatusTab.tsx`.

### Phase `W01.P06` - Document editor domain

Ground then enroll the document-editor elements (save, edit mode, rename, frontmatter, relate, archive, autofix, close) on this surface.

- [x] `W01.P06.S31` - Ground the keyboard coverage of the Document editor elements via rag semantic search before enrolling; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P06.S32` - Enroll the save body verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W01.P06.S33` - Enroll the edit-mode toggle verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W01.P06.S34` - Enroll the rename verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W01.P06.S35` - Enroll the frontmatter verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W01.P06.S36` - Enroll the relate verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W01.P06.S37` - Enroll the archive verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W01.P06.S38` - Enroll the autofix verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W01.P06.S39` - Enroll the close verbs as a keyboard command shortcut (KeybindingDef plus registerKeyAction thunk) on the keymap registry; `frontend/src/stores/view/editor.ts`.

## Wave `W02` - Context menus surface

Map every UI element's verbs onto the per-kind resolver registry: each element's right-click menu offers its applicable verbs composed from the shared builders, one resolver per kind. Parity domains mirror W01 and W03 exactly.

### Phase `W02.P07` - Global chrome domain

Ground then enroll the global chrome elements (command palette, window layout, settings, theme, help legend) on this surface.

- [x] `W02.P07.S40` - Ground the context-menu coverage of the Global chrome elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P07.S41` - Enroll the command palette verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W02.P07.S42` - Enroll the window layout verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/shellLayout.ts`.
- [x] `W02.P07.S43` - Enroll the settings dialog verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/settings/SettingsDialog.tsx`.
- [x] `W02.P07.S44` - Enroll the theme verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/server/themeSettingIntent.ts`.
- [x] `W02.P07.S45` - Enroll the help legend verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/keyboardShortcuts.ts`.

### Phase `W02.P08` - Left rail domain

Ground then enroll the left-rail elements (workspace, worktree, vault-doc, code-file, filter facets, browser mode, tree disclosure) on this surface.

- [x] `W02.P08.S46` - Ground the context-menu coverage of the Left rail elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P08.S47` - Enroll the workspace verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/left/menus/workspaceMenu.ts`.
- [x] `W02.P08.S48` - Enroll the worktree verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/left/menus/worktreeMenu.ts`.
- [x] `W02.P08.S49` - Enroll the vault-doc verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/left/menus/vaultDocMenu.ts`.
- [x] `W02.P08.S50` - Enroll the code-file verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/left/menus/codeFileMenu.ts`.
- [x] `W02.P08.S51` - Enroll the filter facets verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/filterSidebar.ts`.
- [x] `W02.P08.S52` - Enroll the browser mode verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/browserMode.ts`.
- [x] `W02.P08.S53` - Enroll the tree disclosure verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/browserTreeExpansion.ts`.

### Phase `W02.P09` - Graph stage domain

Ground then enroll the graph-stage elements (node, edge, meta-edge, island, canvas, graph controls) on this surface.

- [x] `W02.P09.S54` - Ground the context-menu coverage of the Graph stage elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P09.S55` - Enroll the node verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W02.P09.S56` - Enroll the edge verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/right/menus/edgeMenu.ts`.
- [x] `W02.P09.S57` - Enroll the meta-edge verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/stage/menus/metaEdgeMenu.ts`.
- [x] `W02.P09.S58` - Enroll the island verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/islands/menus/islandMenu.ts`.
- [x] `W02.P09.S59` - Enroll the canvas verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/stage/menus/canvasMenu.ts`.
- [x] `W02.P09.S60` - Enroll the graph controls verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/graphCommands.ts`.

### Phase `W02.P10` - Timeline domain

Ground then enroll the timeline elements (event, playhead, range, mode) on this surface.

- [x] `W02.P10.S61` - Ground the context-menu coverage of the Timeline elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P10.S62` - Enroll the event mark verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/timeline/menus/eventMarkMenu.ts`.
- [x] `W02.P10.S63` - Enroll the playhead verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/timelineIntent.ts`.
- [x] `W02.P10.S64` - Enroll the range verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/timeline.ts`.
- [x] `W02.P10.S65` - Enroll the mode verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/timeline.ts`.

### Phase `W02.P11` - Right rail domain

Ground then enroll the right-rail elements (change, search-result, commit/PR) on this surface.

- [x] `W02.P11.S66` - Ground the context-menu coverage of the Right rail elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P11.S67` - Enroll the change verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `W02.P11.S68` - Enroll the search result verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/right/menus/searchResultMenu.ts`.
- [x] `W02.P11.S69` - Enroll the commit and PR verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/right/StatusTab.tsx`.

### Phase `W02.P12` - Document editor domain

Ground then enroll the document-editor elements (save, edit mode, rename, frontmatter, relate, archive, autofix, close) on this surface.

- [x] `W02.P12.S70` - Ground the context-menu coverage of the Document editor elements via rag semantic search before enrolling; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P12.S71` - Enroll the save body verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W02.P12.S72` - Enroll the edit-mode toggle verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W02.P12.S73` - Enroll the rename verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W02.P12.S74` - Enroll the frontmatter verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W02.P12.S75` - Enroll the relate verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W02.P12.S76` - Enroll the archive verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W02.P12.S77` - Enroll the autofix verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W02.P12.S78` - Enroll the close verbs into its per-kind context-menu resolver via the shared builders; `frontend/src/stores/view/editor.ts`.

## Wave `W03` - Cmd-K palette surface

Map every UI element's verbs onto the command-family providers: each element's verbs are discoverable in the palette under their family, run-only and provider-fed, with the standardized open verb. Parity domains mirror W01 and W02 exactly.

### Phase `W03.P13` - Global chrome domain

Ground then enroll the global chrome elements (command palette, window layout, settings, theme, help legend) on this surface.

- [x] `W03.P13.S79` - Ground the palette coverage of the Global chrome elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P13.S80` - Enroll the command palette verbs as run-only palette commands under their family; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W03.P13.S81` - Enroll the window layout verbs as run-only palette commands under their family; `frontend/src/stores/view/shellLayout.ts`.
- [x] `W03.P13.S82` - Enroll the settings dialog verbs as run-only palette commands under their family; `frontend/src/app/settings/SettingsDialog.tsx`.
- [x] `W03.P13.S83` - Enroll the theme verbs as run-only palette commands under their family; `frontend/src/stores/server/themeSettingIntent.ts`.
- [x] `W03.P13.S84` - Enroll the help legend verbs as run-only palette commands under their family; `frontend/src/stores/view/keyboardShortcuts.ts`.

### Phase `W03.P14` - Left rail domain

Ground then enroll the left-rail elements (workspace, worktree, vault-doc, code-file, filter facets, browser mode, tree disclosure) on this surface.

- [x] `W03.P14.S85` - Ground the palette coverage of the Left rail elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P14.S86` - Enroll the workspace verbs as run-only palette commands under their family; `frontend/src/app/left/menus/workspaceMenu.ts`.
- [x] `W03.P14.S87` - Enroll the worktree verbs as run-only palette commands under their family; `frontend/src/app/left/menus/worktreeMenu.ts`.
- [x] `W03.P14.S88` - Enroll the vault-doc verbs as run-only palette commands under their family; `frontend/src/app/left/menus/vaultDocMenu.ts`.
- [x] `W03.P14.S89` - Enroll the code-file verbs as run-only palette commands under their family; `frontend/src/app/left/menus/codeFileMenu.ts`.
- [x] `W03.P14.S90` - Enroll the filter facets verbs as run-only palette commands under their family; `frontend/src/stores/view/filterSidebar.ts`.
- [x] `W03.P14.S91` - Enroll the browser mode verbs as run-only palette commands under their family; `frontend/src/stores/view/browserMode.ts`.
- [x] `W03.P14.S92` - Enroll the tree disclosure verbs as run-only palette commands under their family; `frontend/src/stores/view/browserTreeExpansion.ts`.

### Phase `W03.P15` - Graph stage domain

Ground then enroll the graph-stage elements (node, edge, meta-edge, island, canvas, graph controls) on this surface.

- [x] `W03.P15.S93` - Ground the palette coverage of the Graph stage elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P15.S94` - Enroll the node verbs as run-only palette commands under their family; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W03.P15.S95` - Enroll the edge verbs as run-only palette commands under their family; `frontend/src/app/right/menus/edgeMenu.ts`.
- [x] `W03.P15.S96` - Enroll the meta-edge verbs as run-only palette commands under their family; `frontend/src/app/stage/menus/metaEdgeMenu.ts`.
- [x] `W03.P15.S97` - Enroll the island verbs as run-only palette commands under their family; `frontend/src/app/islands/menus/islandMenu.ts`.
- [x] `W03.P15.S98` - Enroll the canvas verbs as run-only palette commands under their family; `frontend/src/app/stage/menus/canvasMenu.ts`.
- [x] `W03.P15.S99` - Enroll the graph controls verbs as run-only palette commands under their family; `frontend/src/stores/view/graphCommands.ts`.

### Phase `W03.P16` - Timeline domain

Ground then enroll the timeline elements (event, playhead, range, mode) on this surface.

- [x] `W03.P16.S100` - Ground the palette coverage of the Timeline elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P16.S101` - Enroll the event mark verbs as run-only palette commands under their family; `frontend/src/app/timeline/menus/eventMarkMenu.ts`.
- [x] `W03.P16.S102` - Enroll the playhead verbs as run-only palette commands under their family; `frontend/src/stores/view/timelineIntent.ts`.
- [x] `W03.P16.S103` - Enroll the range verbs as run-only palette commands under their family; `frontend/src/stores/view/timeline.ts`.
- [x] `W03.P16.S104` - Enroll the mode verbs as run-only palette commands under their family; `frontend/src/stores/view/timeline.ts`.

### Phase `W03.P17` - Right rail domain

Ground then enroll the right-rail elements (change, search-result, commit/PR) on this surface.

- [x] `W03.P17.S105` - Ground the palette coverage of the Right rail elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P17.S106` - Enroll the change verbs as run-only palette commands under their family; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `W03.P17.S107` - Enroll the search result verbs as run-only palette commands under their family; `frontend/src/app/right/menus/searchResultMenu.ts`.
- [x] `W03.P17.S108` - Enroll the commit and PR verbs as run-only palette commands under their family; `frontend/src/app/right/StatusTab.tsx`.

### Phase `W03.P18` - Document editor domain

Ground then enroll the document-editor elements (save, edit mode, rename, frontmatter, relate, archive, autofix, close) on this surface.

- [x] `W03.P18.S109` - Ground the palette coverage of the Document editor elements via rag semantic search before enrolling; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [x] `W03.P18.S110` - Enroll the save body verbs as run-only palette commands under their family; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P18.S111` - Enroll the edit-mode toggle verbs as run-only palette commands under their family; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P18.S112` - Enroll the rename verbs as run-only palette commands under their family; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P18.S113` - Enroll the frontmatter verbs as run-only palette commands under their family; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P18.S114` - Enroll the relate verbs as run-only palette commands under their family; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P18.S115` - Enroll the archive verbs as run-only palette commands under their family; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P18.S116` - Enroll the autofix verbs as run-only palette commands under their family; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W03.P18.S117` - Enroll the close verbs as run-only palette commands under their family; `frontend/src/stores/view/editor.ts`.

## Description

This plan mechanically enrolls every UI element's action verbs across the three
client surfaces the action plane diverges into, with full parity: each element is
considered and enrolled on every applicable surface. One Wave per surface (keyboard
shortcuts, context menus, Cmd-K palette); within each Wave the SAME six domains in the
SAME order, and within each domain the SAME UI elements as Steps. That repetition is
the parity contract: the matrix is element x surface, and a Step exists for every
cell, so a reviewer reads down a domain across the three Waves and sees an element's
coverage on all three surfaces at a glance.

The verbs are authored once as shared `ActionDescriptor` builders per the
`unified-action-plane` rule; this plan does not re-author them, it enrolls the one
taxonomy into each surface so every element is reachable by chord, by right-click, and
by palette. The element inventory, fixed across all three Waves, is:

- Global chrome: command palette, window layout, settings dialog, theme, help legend.
- Left rail: workspace, worktree, vault-doc, code-file, filter facets, browser mode,
  tree disclosure.
- Graph stage: node, edge, meta-edge, island, canvas, graph controls.
- Timeline: event mark, playhead, range, mode.
- Right rail: change, search result, commit and PR.
- Document editor: save body, edit-mode toggle, rename, frontmatter, relate, archive,
  autofix, close.

Every Phase opens with a rag-grounding Step: a `vaultspec-rag search --type code` pass
over that surface's registry and that domain's elements, to inventory the live
coverage and the gap before enrolling, so each Phase audits the real code rather than
a remembered shape. An element that genuinely has no verb on a surface (a non-
interactive canvas chord, say) is recorded as an explicit no-op with reason in that
Step, never silently dropped, so the parity matrix has no unexplained holes. The work
is backed by the accepted command-palette ADR cluster (taxonomy, planes, providers),
the keyboard-action-system ADR, and the dashboard-context-menus ADR in `related`; the
`keyboard-shortcuts-bind-through-the-one-keymap-registry` and `unified-action-plane`
rules are binding.

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

The three Waves are sequenced W01 keyboard, then W02 context menus, then W03 palette:
each Wave's grounding refines the shared element-and-verb inventory the next Wave
reuses, and landing the keyboard surface first exercises the builders' run and
dispatch lanes the menu and palette surfaces then compose. Within a Wave the six
domain Phases share no hard interdependency and may be parallelized one domain per
agent, but every Phase's rag-grounding Step is the hard predecessor of that Phase's
element Steps. Because the same domain Phase appears in all three Waves, a single agent
may instead own one domain end-to-end across the three surfaces to keep an element's
parity coherent; the gate Step closes each Wave.

## Verification

- Parity matrix complete: for every UI element in the fixed inventory there is a closed
  Step in each of the three Waves, and any element with no verb on a surface carries an
  explicit recorded no-op-with-reason rather than a missing Step.
- Keyboard (W01): the keyboard gate passes - every enrolled element verb that warrants
  a chord is a `KeybindingDef` with a registered `registerKeyAction` thunk, the `?`
  legend derives from the registry, and no surface owns a private command-key listener.
- Context menus (W02): the context-menu gate passes - every element kind offers its
  applicable verbs composed from the shared builders, exactly one resolver per kind,
  selection-relative verbs read `ctx.selectedNodeId`, mutating verbs carry
  `disabledInTimeTravel`.
- Palette (W03): the palette gate passes - every element verb is a run-only
  `PaletteCommand` under its family, the open verb is the one standardized builder,
  destructive verbs arm-to-confirm, the three planes stay separated.
- Cross-surface: the `unified-action-plane` invariant holds - each verb is one builder
  enrolled across all three surfaces, never re-derived; `just dev lint frontend` is
  green (eslint, prettier, tsc) and the touched-module tests pass for every Wave.
- The plan is complete when every Step is closed (`- [x]`).
