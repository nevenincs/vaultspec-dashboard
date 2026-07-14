---
tags:
  - '#plan'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-15'
tier: L3
related:
  - '[[2026-07-14-frontend-localization-adr]]'
  - '[[2026-07-14-frontend-localization-research]]'
  - '[[2026-07-14-frontend-localization-reference]]'
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

<!-- RETIRED: S40, S219 -->

# `frontend-localization` plan

Migrate every user-facing frontend string to typed locale catalogs and enforce one
readable, language-agnostic UX grammar across commands, menus, statuses, errors,
accessibility text, and dynamic messages.

## Description

This plan executes the accepted localization architecture across the complete frontend.
It first establishes the runtime, typed descriptors, formatting, locale authority, and
catalog enforcement. It then migrates shared action and presentation contracts before
dispatching bounded domain phases across every application and auxiliary surface. The
final Wave removes all exemptions and proves that no source-language literal, unsafe
fallback, fixed-locale formatter, em dash, or internal diagnostic vocabulary remains in
visible or accessible production output.

## Wave `W01` - localization substrate and source-locale policy

Establish the typed runtime, English catalogs, locale-aware formatting, persisted language authority, and initial enforcement that every later Wave consumes.

### Phase `W01.P01` - runtime catalogs and formatting

Install and initialize the localization runtime, define typed message and formatting contracts, and ship the complete source-locale resource foundation.

- [x] `W01.P01.S01` - Install the approved localization dependencies and lock exact compatible versions; `frontend/package.json, frontend/package-lock.json`.
- [x] `W01.P01.S02` - Create the English namespace catalogs and typed resource aggregate; `frontend/src/locales/en/`.
- [x] `W01.P01.S03` - Define bounded typed message keys, values, descriptors, and confirmation descriptors; `frontend/src/platform/localization/message.ts`.
- [x] `W01.P01.S04` - Implement synchronous localization runtime initialization; `frontend/src/platform/localization/runtime.ts`.
- [x] `W01.P01.S05` - Implement locale-aware number, date, relative-time, list, duration, percentage, and byte formatters; `frontend/src/platform/localization/formatters.ts`.
- [x] `W01.P01.S06` - Mount localization before the application boundary without changing theme or data-provider authority; `frontend/src/main.tsx`.
- [x] `W01.P01.S07` - Prove runtime initialization, descriptor resolution, formatting, missing-key safety, and locale reactivity with production resources; `frontend/src/platform/localization/*.test.tsx`.
- [x] `W01.P01.S116` - Implement the React localization provider over the initialized production runtime; `frontend/src/platform/localization/LocalizationProvider.tsx`.
- [x] `W01.P01.S117` - Implement safe production fallback that never exposes missing keys or diagnostic values; `frontend/src/platform/localization/fallback.ts`.
- [x] `W01.P01.S118` - Apply and reactively update document language and direction attributes; `frontend/src/platform/localization/documentLanguage.ts`.
- [x] `W01.P01.S244` - Create bounded non-shipped alternate-locale resources for real locale-reactivity tests; `frontend/src/localization/testing/`.

### Phase `W01.P02` - language preference authority

Add the schema-owned locale preference, synchronous cache-and-reconcile behavior, and language selection UI without creating a second authority.

- [ ] `W01.P02.S08` - Add the global language setting and semantic display metadata while preserving the schema-owned settings contract; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [ ] `W01.P02.S09` - Adapt settings wire types and selectors to expose locale identity without serving resolved English; `frontend/src/stores/server/engine, frontend/src/stores/server/settingsSelectors.ts`.
- [ ] `W01.P02.S10` - Implement the locale preference controller with system resolution and synchronous cache reconciliation; `frontend/src/platform/localization/localeController.ts`.
- [ ] `W01.P02.S11` - Render the schema-owned language control through localized setting metadata; `frontend/src/app/settings/SettingsDialog.tsx, frontend/src/app/settings/controls/registry.tsx, frontend/src/app/settings/controls/EnumControl.tsx, frontend/src/stores/view/settingsControls.ts`.
- [ ] `W01.P02.S12` - Exercise the real settings wire and locale controller without mocks or frontend-only authority; `engine/crates/vaultspec-session/src/settings_schema.rs, frontend/src/stores/server/settingsSelectors.test.ts`.

### Phase `W01.P03` - catalog and source enforcement foundation

Introduce real catalog invariants and a bounded source scanner that can tighten monotonically as migration proceeds.

- [x] `W01.P03.S13` - Validate the complete required key set across every shipped locale; `frontend/src/localization/catalogKeys.test.ts`.
- [x] `W01.P03.S14` - Implement the bounded production-source localization scanner with narrow semantic exclusions; `frontend/scripts/scan-localization.mjs, frontend/scripts/localization-allowlist.json`.
- [x] `W01.P03.S15` - Add the localization scanner to the standard frontend lint gate; `frontend/package.json, justfile`.
- [x] `W01.P03.S16` - Prove the scanner against production files and real rule fixtures without mirrored business logic; `frontend/scripts/scan-localization.test.ts, frontend/scripts/fixtures/localization/`.
- [x] `W01.P03.S119` - Validate interpolation parameter parity across every shipped locale; `frontend/src/localization/catalogInterpolation.test.ts`.
- [x] `W01.P03.S120` - Validate plural categories and formatter-backed dynamic messages against production resources; `frontend/src/platform/localization/message.ts, frontend/src/platform/localization/fallback.ts, frontend/src/platform/localization/LocalizationProvider.tsx, frontend/src/platform/localization/runtime.test.ts, frontend/src/locales/en/common.ts, frontend/src/localization/catalogPlural.test.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/catalogInterpolation.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/messagePolicy.test.ts, frontend/src/localization/testing/resources.ts, frontend/src/stores/view/commandPalette.ts`.
- [x] `W01.P03.S121` - Enforce concise plain-language wording, sentence case, canonical imperative verbs, prohibited vocabulary, and actionable recovery in source locale messages; `frontend/src/localization/messagePolicy.ts, frontend/src/localization/messagePolicy.test.ts, frontend/src/locales/en/`.

## Wave `W02` - shared action and presentation contracts

Migrate the cross-surface descriptor, command, keymap, and vocabulary contracts once so menus, palettes, shortcuts, and store projections cannot drift.

### Phase `W02.P04` - action descriptor convergence

Change shared actions and confirmations from resolved English to typed message
descriptors while preserving IDs, lanes, and eligibility. `S17` and `S18` are final
closure gates: they execute only after every compiled action producer, including the
menu and reader producers scheduled through `S82`, has left the temporary bridge.

- [x] `W02.P04.S245` - Seed canonical shared action, disabled-reason, and explicit confirmation catalog ownership before changing producer types; `frontend/src/locales/en/, frontend/src/localization/messagePolicy.ts, frontend/src/localization/messagePolicy.test.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/testing/resources.ts`.
- [x] `W02.P04.S247` - Make action rendering boundaries resolve typed labels, reasons, and full confirmations while preserving stable IDs and legacy behavior during migration; `frontend/scripts/localization-allowlist.json, frontend/src/app/chrome/ActionConfirmationDialog.test.tsx, frontend/src/app/chrome/ActionConfirmationDialog.tsx, frontend/src/app/menu/ContextMenuHost.interactive.test.tsx, frontend/src/app/menu/ContextMenuHost.render.test.tsx, frontend/src/app/menu/ContextMenuHost.tsx, frontend/src/app/palette/CommandPalette.render.test.tsx, frontend/src/app/palette/CommandPalette.test.ts, frontend/src/app/palette/CommandPalette.tsx, frontend/src/app/palette/commandPalettePresentation.test.ts, frontend/src/app/palette/commandPalettePresentation.ts, frontend/src/app/shell/CompactAppShell.tsx, frontend/src/app/shell/MobileTopBar.render.test.tsx, frontend/src/app/shell/MobileTopBar.tsx, frontend/src/app/stage/DockWorkspace.tsx, frontend/src/app/stage/ProvisionPanel.render.test.tsx, frontend/src/app/stage/ProvisionPanel.tsx, frontend/src/locales/en/common.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/src/platform/actions/action.ts, frontend/src/platform/actions/registry.test.ts, frontend/src/platform/localization/LocalizationProvider.tsx, frontend/src/platform/localization/fallback.ts, frontend/src/platform/localization/message.ts, frontend/src/platform/localization/reactivity.test.tsx, frontend/src/platform/localization/runtime.test.ts, frontend/src/stores/view/commandPaletteCommands.test.ts, frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/stores/view/contextMenu.test.ts, frontend/src/stores/view/contextMenu.ts, frontend/src/stores/view/provisionActions.test.ts`.
- [x] `W02.P04.S246` - Introduce the bounded branded and scanner-visible legacy action presentation bridge, wrap every compiled legacy action label and disabled reason without changing visible copy, replace only the affected exact scanner baseline entries, and prove scanner tamper, stale-baseline, normalization, and rendering compatibility; `frontend/src/platform/actions/action.ts, frontend/src/platform/actions/registry.test.ts, frontend/src/platform/actions/clipboardActions.ts, frontend/src/platform/actions/shellActions.ts, frontend/src/app/, frontend/src/stores/view/, frontend/scripts/scan-localization.mjs, frontend/scripts/scan-localization.test.ts, frontend/scripts/fixtures/localization/, frontend/scripts/localization-allowlist.json`.
- [ ] `W02.P04.S17` - After every action producer through S82 is migrated, remove the legacy bridge and require bounded typed labels, reasons, and confirmations in the final action contract; `frontend/src/platform/actions/action.ts, frontend/src/platform/actions/registry.ts`.
- [ ] `W02.P04.S18` - Prove the final strict action contract, normalization, execution lanes, descriptor safety, and explicit destructive copy; `frontend/src/platform/actions/registry.test.ts`.
- [x] `W02.P04.S19` - Migrate the clipboard action builder and every menu caller to canonical localized copy verbs without deriving labels from copied content; `frontend/src/platform/actions/clipboardActions.ts, frontend/src/platform/actions/clipboardActions.test.ts, frontend/src/app/islands/menus/islandMenu.ts, frontend/src/app/left/menus/codeFileMenu.ts, frontend/src/app/left/menus/vaultCategoryMenu.ts, frontend/src/app/left/menus/vaultDocMenu.ts, frontend/src/app/left/menus/vaultFeatureMenu.ts, frontend/src/app/left/menus/workspaceMenu.ts, frontend/src/app/left/menus/worktreeMenu.ts, frontend/src/app/right/menus/changeMenu.ts, frontend/src/app/right/menus/commitMenu.ts, frontend/src/app/right/menus/edgeMenu.ts, frontend/src/app/right/menus/prMenu.ts, frontend/src/app/right/menus/searchResultMenu.ts, frontend/src/app/stage/menus/graphNodeMenu.ts, frontend/src/app/stage/menus/metaEdgeMenu.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S20` - Migrate the shared open-entity action builder once and remove caller-owned English overrides; `frontend/src/app/menus/sharedActions.ts, frontend/src/app/menus/sharedActions.test.ts, frontend/src/app/right/menus/searchResultMenu.ts, frontend/src/app/right/menus/rightMenus.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S21` - Migrate background and global-tail composition without duplicating shared action wording; `frontend/src/app/menus/backgroundMenu.ts, frontend/src/app/menus/globalTail.ts`.
- [x] `W02.P04.S122` - Migrate reveal, editor, and unavailable shell action messages without browser implementation vocabulary; `frontend/src/platform/actions/shellActions.ts, frontend/src/platform/actions/shellActions.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S123` - Migrate shared chrome action builders without changing action IDs or dispatch behavior; `frontend/src/stores/view/chromeActions.ts, frontend/src/stores/view/chromeActions.test.ts, frontend/src/stores/view/followMode.test.ts, frontend/src/stores/view/commandRegistry.ts, frontend/src/stores/view/commandRegistry.test.ts, frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/stores/view/commandPalette.guard.test.ts, frontend/src/stores/view/actionCoverage.guard.test.ts, frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.ts, frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.test.ts, frontend/src/stores/view/commandProviders/documentCommandProvider.test.ts, frontend/src/stores/view/commandProviders/reloadCommandProvider.test.ts, frontend/src/stores/view/commandProviders/opsCommandProvider.test.ts, frontend/src/app/right/FrameworkStatusCluster.tsx, frontend/src/app/settings/useSettingsDialog.test.ts, frontend/src/app/viewer/MarkdownDocView.render.test.tsx, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S124` - Migrate project action builders to canonical localized verbs and actionable reasons; `frontend/src/stores/view/projectActions.ts, frontend/src/stores/view/projectActions.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S125` - Migrate document-link action builders to canonical localized verbs and explicit confirmations; `frontend/src/stores/view/documentLinkActions.ts, frontend/src/stores/view/documentLinkActions.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S148` - Migrate the shared relate-to-selection action builder once; `frontend/src/app/menus/sharedActions.ts, frontend/src/app/menus/sharedActions.test.ts, frontend/src/app/stage/menus/graphNodeMenu.ts, frontend/src/app/left/menus/leftMenus.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S149` - Migrate the shared feature-autofix action builder once; `frontend/src/app/menus/sharedActions.ts, frontend/src/app/menus/sharedActions.test.ts, frontend/src/app/left/menus/leftMenus.test.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P04.S150` - Migrate the shared archive-feature action builder with explicit destructive confirmation copy; `frontend/src/app/menus/sharedActions.ts, frontend/src/app/menus/sharedActions.test.ts, frontend/src/app/left/menus/leftMenus.test.ts, frontend/scripts/localization-allowlist.json`.

### Phase `W02.P05` - keymap command and palette convergence

Migrate keybinding, command-provider, palette, and context-menu contracts and resolve all messages at React rendering boundaries.

- [x] `W02.P05.S22` - Replace keybinding labels and groups with typed messages while preserving IDs, chords, and contexts; `frontend/src/platform/keymap/registry.ts, frontend/src/platform/keymap/registry.test.ts, frontend/scripts/scan-localization.mjs, frontend/scripts/scan-localization.test.ts, frontend/scripts/fixtures/localization/invalid/legacy-keybinding-presentation.ts, frontend/scripts/localization-allowlist.json, frontend/src/stores/view/commandPalette.ts, frontend/src/stores/view/keyboardNavigation.ts, frontend/src/stores/view/keyboardShortcuts.ts, frontend/src/stores/view/settingsControls.ts, frontend/src/stores/view/leftRailKeybindings.ts, frontend/src/stores/view/editorKeybindings.ts, frontend/src/stores/view/graphToggleKeybindings.ts, frontend/src/app/stage/graphWalkKeybindings.ts, frontend/src/app/stage/graphWalkKeybindings.test.ts, frontend/src/app/chrome/regionCycleKeybindings.ts, frontend/src/stores/view/docTabKeybindings.ts, frontend/src/stores/view/projectActions.ts, frontend/src/stores/view/reloadKeybindings.ts, frontend/src/stores/view/rightRailKeybindings.ts, frontend/src/stores/view/workingSet.ts, frontend/src/stores/view/keymapDispatcher.test.ts, frontend/src/stores/view/keyboardShortcuts.test.ts, frontend/src/stores/view/settingsControls.test.ts, frontend/src/app/settings/controls/KeybindingControl.test.tsx, frontend/src/stores/view/commandPaletteCommands.test.ts, frontend/src/stores/view/defaultKeybindingConflicts.guard.test.ts`.
- [x] `W02.P05.S33` - Carry shortcut messages through the store and resolve them reactively in the dialog while using stable action and group IDs as keys; `frontend/src/stores/view/keyboardShortcuts.ts, frontend/src/stores/view/keyboardShortcuts.test.ts, frontend/src/app/menu/KeyboardShortcuts.tsx, frontend/src/app/menu/KeyboardShortcuts.render.test.tsx, frontend/src/locales/en/common.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S248` - Resolve keybinding settings labels, groups, recorder guidance, and conflicts at the React boundary without raw action-ID fallbacks; `frontend/src/stores/view/settingsControls.ts, frontend/src/stores/view/settingsControls.test.ts, frontend/src/app/settings/controls/KeybindingControl.tsx, frontend/src/app/settings/controls/KeybindingControl.test.tsx, frontend/src/locales/en/common.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S23` - Separate localized keycap display names from canonical chord identity and reject corrupt display fallbacks; `frontend/src/platform/keymap/chord.ts, frontend/src/platform/keymap/chord.test.ts, frontend/src/platform/actions/action.ts, frontend/src/platform/actions/registry.test.ts, frontend/src/stores/view/chromeActions.ts, frontend/src/stores/view/chromeActions.test.ts, frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/stores/view/commandPaletteCommands.test.ts, frontend/src/stores/view/contextMenu.ts, frontend/src/stores/view/contextMenu.test.ts, frontend/src/stores/view/keyboardShortcuts.ts, frontend/src/stores/view/keyboardShortcuts.test.ts, frontend/src/stores/view/settingsControls.ts, frontend/src/stores/view/settingsControls.test.ts, frontend/src/app/menus/globalTail.ts, frontend/src/app/menus/globalTail.test.ts, frontend/src/app/menu/ContextMenuHost.tsx, frontend/src/app/menu/KeyboardShortcuts.tsx, frontend/src/app/palette/CommandPalette.tsx, frontend/src/app/settings/controls/KeybindingControl.tsx, frontend/src/app/settings/controls/KeybindingControl.test.tsx, frontend/src/app/viewer/DocChrome.tsx, frontend/src/app/viewer/DocChrome.render.test.tsx, frontend/src/locales/en/common.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S24` - Migrate left-rail keybinding definitions to shared canonical action wording; `frontend/src/stores/view/leftRailKeybindings.ts, frontend/src/stores/view/leftRailKeybindings.localization.test.ts, frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/app/left/leftRailActions.test.tsx, frontend/src/locales/en/common.ts, frontend/src/locales/en/documents.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S25` - Migrate editor keybinding definitions and actionable disabled reasons; `frontend/src/stores/view/editorKeybindings.ts, frontend/src/stores/view/editorKeybindings.render.test.tsx, frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/stores/view/commandPaletteCommands.test.ts, frontend/src/app/viewer/MarkdownDocView.tsx, frontend/src/app/viewer/MarkdownDocView.render.test.tsx, frontend/src/app/viewer/DocChrome.tsx, frontend/src/app/viewer/DocChrome.render.test.tsx, frontend/src/locales/en/common.ts, frontend/src/locales/en/documents.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S26` - Migrate graph-walk, graph-toggle, and focus-region keybinding definitions without changing dispatch identity; `frontend/src/app/stage/graphWalkKeybindings.ts, frontend/src/app/stage/graphWalkKeybindings.test.ts, frontend/src/app/stage/graphWalkKeybindings.localization.test.ts, frontend/src/stores/view/graphToggleKeybindings.ts, frontend/src/stores/view/graphToggleKeybindings.localization.test.ts, frontend/src/app/chrome/regionCycleKeybindings.ts, frontend/src/app/chrome/regionCycleKeybindings.localization.test.ts, frontend/src/locales/en/common.ts, frontend/src/locales/en/graph.ts, frontend/src/locales/en/index.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S27` - Change command descriptors and provider normalization to carry message descriptors; `frontend/src/stores/view/commandRegistry.ts, frontend/src/stores/view/commandRegistry.localization.test.ts`.
- [x] `W02.P05.S28` - Replace palette presentation strings with typed message descriptors; `frontend/src/stores/view/commandPalette.ts, frontend/src/stores/view/commandPalette.localization.test.ts, frontend/src/stores/view/keyboardShortcuts.ts, frontend/src/stores/view/keyboardShortcuts.test.ts, frontend/src/stores/view/reloadKeybindings.ts, frontend/src/locales/en/common.ts, frontend/src/locales/en/documents.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [x] `W02.P05.S29` - Localize command-family headings without exposing internal family tokens; `frontend/src/stores/view/commandPaletteCommands.ts, frontend/src/stores/view/commandPaletteCommands.test.ts, frontend/src/stores/view/commandPaletteFamilies.localization.test.ts, frontend/src/app/palette/CommandPalette.tsx, frontend/src/app/palette/CommandPalette.render.test.tsx, frontend/src/locales/en/common.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts`.
- [x] `W02.P05.S30` - Replace operational provider labels and internal service vocabulary with typed user concepts; `frontend/src/stores/view/commandProviders/opsCommandProvider.ts, frontend/src/stores/view/commandProviders/opsCommandProvider.test.ts`.
- [ ] `W02.P05.S31` - Resolve menu labels, reasons, confirmations, feedback, and live messages at the context-menu boundary; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [ ] `W02.P05.S32` - Resolve command, search, count, confirmation, and live-region messages at the palette boundary; `frontend/src/app/palette/CommandPalette.tsx`.
- [ ] `W02.P05.S34` - Prove one action ID renders identical wording across menu, palette, and shortcut planes; `frontend/src/app/menu/*.test.tsx, frontend/src/app/palette/*.test.tsx`.
- [x] `W02.P05.S126` - Replace arbitrary palette operation feedback strings with typed outcome descriptors; `frontend/src/stores/view/commandPalette.ts, frontend/src/stores/view/commandPalette.test.ts, frontend/src/stores/view/commandPaletteOpsFeedback.test.ts, frontend/src/stores/view/commandPaletteOpsFeedback.localization.test.ts, frontend/src/stores/view/opsRun.ts, frontend/src/stores/view/opsRun.test.ts, frontend/src/app/palette/CommandPalette.tsx, frontend/src/app/palette/CommandPalette.render.test.tsx, frontend/src/locales/en/common.ts, frontend/src/locales/en/operations.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts`.
- [x] `W02.P05.S127` - Replace operation whitelist display labels with localized user concepts while preserving operation IDs; `frontend/src/stores/server/opsActions.ts, frontend/src/stores/server/opsActions.localization.test.ts, frontend/src/locales/en/operations.ts, frontend/src/locales/en/index.ts, frontend/src/localization/catalogKeys.test.ts, frontend/src/localization/messagePolicy.ts, frontend/src/localization/testing/resources.ts, frontend/scripts/localization-allowlist.json`.
- [ ] `W02.P05.S146` - Migrate reload keybinding definitions to the canonical refresh action message; `frontend/src/stores/view/reloadKeybindings.ts`.
- [ ] `W02.P05.S151` - Standardize window-management command builders on imperative sentence-case messages; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [ ] `W02.P05.S152` - Standardize timeline command builders on complete localized range and navigation messages; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [ ] `W02.P05.S153` - Standardize editor command builders on canonical document action verbs; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [ ] `W02.P05.S154` - Standardize graph command builders without focus, node, or layout implementation jargon; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [ ] `W02.P05.S155` - Standardize theme and settings command builders on user-facing preference language; `frontend/src/stores/view/commandPaletteCommands.ts`.
- [ ] `W02.P05.S217` - Migrate right-rail keybinding definitions to shared canonical action wording; `frontend/src/stores/view/rightRailKeybindings.ts`.
- [ ] `W02.P05.S218` - Migrate document-tab keybinding definitions and actionable disabled reasons; `frontend/src/stores/view/docTabKeybindings.ts`.
- [ ] `W02.P05.S220` - Resolve mobile top-bar action and accessibility messages from stable action IDs; `frontend/src/app/shell/MobileTopBar.tsx`.
- [ ] `W02.P05.S249` - Migrate keyboard navigation, project, and working-set bindings not owned by another producer step; `frontend/src/stores/view/keyboardNavigation.ts, frontend/src/stores/view/projectActions.ts, frontend/src/stores/view/workingSet.ts`.
- [ ] `W02.P05.S250` - Remove the temporary keybinding presentation bridge after every producer and display consumer is localized; `frontend/src/platform/keymap/registry.ts, frontend/scripts/scan-localization.mjs, frontend/scripts/localization-allowlist.json, frontend/src/`.

### Phase `W02.P06` - shared presentation vocabularies

Move canonical tab, browser, sort, date-criterion, document-type, status, and feedback vocabularies into catalogs without changing stable tokens.

- [ ] `W02.P06.S35` - Move browser-mode labels into canonical catalog mappings; `frontend/src/stores/view/browserMode.ts`.
- [ ] `W02.P06.S36` - Move right-rail tab and shell-layout labels into canonical catalog mappings; `frontend/src/stores/view/shellLayout.ts`.
- [ ] `W02.P06.S37` - Move timeline date-criterion labels and unavailability reasons into catalog mappings; `frontend/src/app/timeline/timelineDateCriterion.ts`.
- [ ] `W02.P06.S38` - Move document-type display vocabulary into catalogs while preserving raw tokens and order; `frontend/src/stores/server/docTypeVocabulary.ts`.
- [ ] `W02.P06.S39` - Replace action feedback and menu outcome strings with typed result conditions; `frontend/src/stores/view/actionFeedback.ts, frontend/src/stores/server/menuActionOutcome.ts`.
- [ ] `W02.P06.S221` - Move rail-sort labels into canonical catalog mappings; `frontend/src/stores/view/railSort.ts`.
- [ ] `W02.P06.S222` - Move category display vocabulary into catalogs while preserving raw tokens and order; `frontend/src/app/kit/category.ts`.

## Wave `W03` - core application surfaces

Move global chrome, shared kit, left-rail, stage, graph, and island copy onto the approved contracts after the substrate and shared descriptors are stable.

### Phase `W03.P07` - global chrome kit and shell

Localize application-wide navigation, shared primitives, accessibility text, and unexpected-error fallbacks.

- [ ] `W03.P07.S41` - Remove raw error rendering and localize safe application and region recovery actions; `frontend/src/platform/errors/ErrorBoundary.tsx`.
- [ ] `W03.P07.S42` - Localize activity progress counts and accessibility announcements; `frontend/src/app/kit/ActivityIndicator.tsx`.
- [ ] `W03.P07.S43` - Localize shared dialog and confirmation titles, descriptions, and actions; `frontend/src/app/chrome/Dialog.tsx, frontend/src/app/chrome/ConfirmDialog.tsx`.
- [ ] `W03.P07.S44` - Localize desktop shell and icon-rail navigation; `frontend/src/app/AppShell.tsx, frontend/src/app/shell/IconRail.tsx`.
- [ ] `W03.P07.S45` - Migrate global chrome render tests through production catalogs and safe error fallbacks; `frontend/src/app/kit/*.test.tsx, frontend/src/platform/errors/*.test.tsx`.
- [ ] `W03.P07.S112` - Localize the pre-hydration boot shell or make it locale-neutral so static HTML never flashes English; `frontend/index.html`.
- [ ] `W03.P07.S113` - Localize shared keyboard-navigation accessibility guidance and freshness presentation; `frontend/src/app/a11y/KeyboardNav.tsx, frontend/src/app/presentation/freshness.ts`.
- [ ] `W03.P07.S161` - Localize shared search-field placeholders and accessible names; `frontend/src/app/kit/SearchField.tsx`.
- [ ] `W03.P07.S162` - Localize shared loading, empty, degraded, and status primitives; `frontend/src/app/kit/Skeleton.tsx, frontend/src/app/kit/Spinner.tsx, frontend/src/app/kit/StateBlock.tsx`.
- [ ] `W03.P07.S163` - Localize shared section, breadcrumb, property, and progress display labels; `frontend/src/app/kit/SectionLabel.tsx, frontend/src/app/kit/Breadcrumb.tsx, frontend/src/app/kit/PropertyRow.tsx, frontend/src/app/kit/ProgressBar.tsx`.
- [ ] `W03.P07.S164` - Localize bottom-sheet and popover accessibility and dismissal copy; `frontend/src/app/chrome/BottomSheet.tsx, frontend/src/app/kit/Popover.tsx`.
- [ ] `W03.P07.S165` - Localize rail-section and row-menu disclosure accessibility copy; `frontend/src/app/chrome/RailSection.tsx, frontend/src/app/chrome/RowMenuDisclosure.tsx`.
- [ ] `W03.P07.S166` - Localize data-activity and resize-handle announcements; `frontend/src/app/chrome/DataActivityIndicator.tsx, frontend/src/app/chrome/ShellResizeHandle.tsx`.
- [ ] `W03.P07.S167` - Localize compact shell and unified-rail navigation; `frontend/src/app/shell/CompactAppShell.tsx, frontend/src/app/shell/CompactUnifiedRail.tsx`.
- [ ] `W03.P07.S168` - Localize mobile top-bar and bottom-tab navigation; `frontend/src/app/shell/MobileTopBar.tsx, frontend/src/app/shell/BottomTabBar.tsx`.

### Phase `W03.P08` - left rail projects and browsing

Localize project selection, document browsing, filtering, dialogs, menus, and every left-rail state and accessible label.

- [ ] `W03.P08.S46` - Localize project, workspace, and worktree selection with one user-facing identity vocabulary; `frontend/src/app/left/ProjectNavigator.tsx, frontend/src/app/left/WorktreePicker.tsx`.
- [ ] `W03.P08.S47` - Localize tree-browser sections, counts, loading, and partial-result copy; `frontend/src/app/left/TreeBrowser.tsx`.
- [ ] `W03.P08.S48` - Localize filter sidebar and filter menu labels, counts, states, and actions; `frontend/src/app/stage/FilterSidebar.tsx, frontend/src/app/stage/FilterMenu.tsx`.
- [ ] `W03.P08.S49` - Localize add-project dialog guidance, refusal, validation, and actions; `frontend/src/app/left/AddProjectDialog.tsx`.
- [ ] `W03.P08.S50` - Standardize and localize code-file menu actions without internal IDs; `frontend/src/app/left/menus/codeFileMenu.ts`.
- [ ] `W03.P08.S51` - Migrate left-rail browser render tests through production catalogs; `frontend/src/app/left/VaultBrowser.render.test.tsx, frontend/src/app/left/VaultBrowser.compact.render.test.tsx`.
- [ ] `W03.P08.S169` - Localize folder-browser navigation, empty states, and accessible names; `frontend/src/app/left/FolderBrowser.tsx`.
- [ ] `W03.P08.S170` - Localize vault-browser grouping, document states, and accessible names; `frontend/src/app/left/VaultBrowser.tsx`.
- [ ] `W03.P08.S171` - Localize left-rail loading, degraded, empty, and partial state blocks; `frontend/src/app/left/railStates.tsx`.
- [ ] `W03.P08.S172` - Localize create-document dialog fields, validation, confirmations, and actions; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `W03.P08.S173` - Migrate project and worktree render tests through production catalogs; `frontend/src/app/left/ProjectNavigator.render.test.tsx, frontend/src/app/left/WorktreePicker.render.test.tsx`.
- [ ] `W03.P08.S174` - Migrate filter and state render tests through production catalogs; `frontend/src/app/left/RailFilterField.render.test.tsx, frontend/src/app/left/railStates.render.test.tsx, frontend/src/app/stage/FilterMenu.render.test.tsx, frontend/src/app/stage/FilterSidebar.planStates.test.ts`.
- [ ] `W03.P08.S223` - Standardize and localize vault-category menu actions without internal IDs; `frontend/src/app/left/menus/vaultCategoryMenu.ts`.
- [ ] `W03.P08.S224` - Standardize and localize vault-document menu actions without internal IDs; `frontend/src/app/left/menus/vaultDocMenu.ts`.
- [ ] `W03.P08.S225` - Standardize and localize vault-feature menu actions without internal IDs; `frontend/src/app/left/menus/vaultFeatureMenu.ts`.
- [ ] `W03.P08.S226` - Standardize and localize vault-section menu actions without internal IDs; `frontend/src/app/left/menus/vaultSectionMenu.ts`.
- [ ] `W03.P08.S227` - Standardize and localize workspace menu actions with user-facing concepts; `frontend/src/app/left/menus/workspaceMenu.ts`.
- [ ] `W03.P08.S228` - Standardize and localize worktree menu actions with user-facing workspace concepts; `frontend/src/app/left/menus/worktreeMenu.ts`.

### Phase `W03.P09` - stage graph and islands

Localize canvas states, graph controls, provisioning, entity menus, hover cards, and island presentation without exposing graph or rendering internals.

- [ ] `W03.P09.S52` - Localize canvas loading, empty, degraded, truncated, unavailable, and recovery states; `frontend/src/app/stage/CanvasStateOverlay.tsx`.
- [ ] `W03.P09.S53` - Localize provisioning guidance, refusal, progress, and recovery without implementation details; `frontend/src/app/stage/ProvisionPanel.tsx`.
- [ ] `W03.P09.S54` - Localize graph control labels, descriptions, and accessibility names; `frontend/src/app/stage/GraphControls.tsx`.
- [ ] `W03.P09.S55` - Standardize and localize canvas background menu actions; `frontend/src/app/stage/menus/canvasMenu.ts`.
- [ ] `W03.P09.S56` - Localize graph-island interior, empty, loading, and accessibility presentation; `frontend/src/app/islands/IslandLayer.tsx`.
- [ ] `W03.P09.S57` - Migrate stage state and control tests through production catalogs; `frontend/src/app/stage/CanvasStateOverlay.render.test.tsx, frontend/src/app/stage/ProvisionPanel.render.test.tsx`.
- [ ] `W03.P09.S114` - Move production graph-control labels and descriptions into catalogs while retaining technical lab-only vocabulary internally; `frontend/src/scene/three/graphControlSchema.ts`.
- [ ] `W03.P09.S128` - Localize right-menu hover-card accessible names, states, overflow counts, and actions without raw IDs; `frontend/src/app/right/menus/HoverCard.tsx`.
- [ ] `W03.P09.S147` - Replace graph-control store labels, titles, descriptions, and fallback copy with typed descriptors; `frontend/src/stores/view/graphControlsChrome.ts`.
- [ ] `W03.P09.S175` - Localize stage-level labels and accessibility names without rendering internals; `frontend/src/app/stage/Stage.tsx`.
- [ ] `W03.P09.S176` - Localize graph category legend labels and descriptions; `frontend/src/app/stage/CategoryLegend.tsx`.
- [ ] `W03.P09.S177` - Standardize and localize graph-node menu actions and disabled reasons; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [ ] `W03.P09.S178` - Standardize and localize document-tab menu actions and confirmations; `frontend/src/app/stage/menus/docTabMenu.ts`.
- [ ] `W03.P09.S179` - Standardize and localize connection menu actions and disabled reasons; `frontend/src/app/stage/menus/metaEdgeMenu.ts`.
- [ ] `W03.P09.S180` - Localize island hover-card content, overflow counts, and accessible actions; `frontend/src/app/islands/HoverCard.tsx, frontend/src/app/islands/HoverCardLayer.tsx`.
- [ ] `W03.P09.S181` - Migrate island and hover-card tests through production catalogs; `frontend/src/app/islands/HoverCard.render.test.tsx, frontend/src/app/islands/HoverCard.typed.render.test.tsx`.
- [ ] `W03.P09.S215` - Standardize and localize island focus, close, and copy menu actions; `frontend/src/app/islands/menus/islandMenu.ts`.

## Wave `W04` - status search and temporal surfaces

Migrate right-rail, search, timeline, status, degradation, and store-produced presentation copy, including every locale-sensitive formatter and safe error mapping.

### Phase `W04.P10` - right rail status and changes

Localize status, search-service, changes, review, and operational surfaces with safe user-facing state and recovery language.

- [ ] `W04.P10.S58` - Localize status-tab summaries, freshness, unavailable states, and recovery guidance; `frontend/src/app/right/StatusTab.tsx, frontend/src/app/right/FrameworkStatusCluster.tsx`.
- [ ] `W04.P10.S59` - Replace search-service lifecycle and indexing internals with user-facing setup, progress, and recovery copy; `frontend/src/app/right/RagOpsConsole.tsx`.
- [ ] `W04.P10.S60` - Localize changes overview summaries, comparisons, and actions with consistent verbs; `frontend/src/app/right/ChangesOverview.tsx`.
- [ ] `W04.P10.S61` - Localize right-rail empty, loading, degraded, error, and partial states; `frontend/src/app/right/railStates.tsx`.
- [ ] `W04.P10.S62` - Standardize and localize change menu actions; `frontend/src/app/right/menus/changeMenu.ts`.
- [ ] `W04.P10.S63` - Migrate right-rail status render tests through production catalogs; `frontend/src/app/right/FrameworkStatusCluster.render.test.tsx, frontend/src/app/right/PlanStepTree.render.test.tsx`.
- [ ] `W04.P10.S115` - Production-fence the degradation debug switch from user-facing builds; `frontend/src/app/degradation/DebugSwitch.tsx`.
- [ ] `W04.P10.S182` - Standardize and localize commit menu actions and historical-view descriptions; `frontend/src/app/right/menus/commitMenu.ts`.
- [ ] `W04.P10.S183` - Standardize and localize connection menu actions without node, ID, or JSON vocabulary; `frontend/src/app/right/menus/edgeMenu.ts`.
- [ ] `W04.P10.S184` - Standardize and localize pull-request menu actions with consistent product naming; `frontend/src/app/right/menus/prMenu.ts`.
- [ ] `W04.P10.S185` - Migrate right-rail menu tests through production catalogs; `frontend/src/app/right/menus/rightMenus.test.ts, frontend/src/app/right/menus/commitMenu.timeTravel.test.ts`.
- [ ] `W04.P10.S186` - Migrate right-rail action and rail-state tests through production catalogs; `frontend/src/app/right/rightRailActions.test.tsx, frontend/src/app/right/rail.test.ts`.
- [ ] `W04.P10.S243` - Production-fence the crash injector from user-facing builds; `frontend/src/platform/errors/CrashInjector.tsx`.

### Phase `W04.P11` - search and palette surfaces

Complete search dialog, result, provider, empty, degraded, live-region, and result-action localization with locale-aware counts.

- [ ] `W04.P11.S64` - Localize document-search dialog, fields, scopes, results, and live regions; `frontend/src/app/palette/DocumentSearchSurface.tsx`.
- [ ] `W04.P11.S65` - Move search-provider species, degradation, selection, and no-result copy onto typed messages; `frontend/src/stores/server/searchProviders.ts`.
- [ ] `W04.P11.S66` - Localize search result menus and accessible selection descriptions without semantic, vector, score, or node leakage; `frontend/src/app/right/menus/searchResultMenu.ts`.
- [ ] `W04.P11.S67` - Replace manual result counts and relative dates with locale-aware complete messages; `frontend/src/stores/server/searchPill.ts, frontend/src/stores/view/commandPalette.ts`.
- [ ] `W04.P11.S68` - Migrate command-palette render and presentation tests through production catalogs; `frontend/src/app/palette/CommandPalette.render.test.tsx, frontend/src/app/palette/CommandPalette.test.ts`.
- [ ] `W04.P11.S187` - Localize global search surface fields, scopes, results, footer guidance, and live regions; `frontend/src/app/palette/SearchPaletteSurface.tsx`.
- [ ] `W04.P11.S188` - Localize search-result pill species, excerpts, dates, selection state, and accessible actions; `frontend/src/app/palette/SearchResultPill.tsx`.
- [ ] `W04.P11.S189` - Migrate real search-provider and result-presentation tests through production catalogs; `frontend/src/stores/server/searchProviders.test.ts, frontend/src/stores/server/searchPill.test.ts`.
- [ ] `W04.P11.S229` - Move search-result pill species, date, and selection copy onto typed messages; `frontend/src/stores/server/searchPill.ts`.

### Phase `W04.P12` - timeline and temporal formatting

Localize timeline controls, range labels, time-travel messaging, criteria, and every date or relative-time formatter.

- [ ] `W04.P12.S69` - Localize timeline range controls, handles, summaries, and accessibility names; `frontend/src/app/timeline/TimelineRangeSelector.tsx`.
- [ ] `W04.P12.S70` - Replace manual month names and fixed date layouts with locale-aware temporal formatters; `frontend/src/app/timeline/timelineRangeMath.ts, frontend/src/stores/view/timeline.ts`.
- [ ] `W04.P12.S71` - Localize time-travel status and return actions with consistent verbs; `frontend/src/app/timeline/TimeTravelChip.tsx`.
- [ ] `W04.P12.S72` - Migrate timeline range and criterion tests through production catalogs; `frontend/src/app/timeline/TimelineRangeSelector.criterion.render.test.tsx, frontend/src/app/timeline/timelineRangeMath.test.ts`.
- [ ] `W04.P12.S190` - Localize timeline mode, lane, playback, empty, and status presentation; `frontend/src/app/timeline/Timeline.tsx`.
- [ ] `W04.P12.S191` - Migrate time-travel state and store formatting tests through production catalogs; `frontend/src/app/timeline/timeTravel.test.ts, frontend/src/stores/view/timeline.test.ts`.
- [ ] `W04.P12.S230` - Localize timeline filter criteria and unavailable-state messages with consistent verbs; `frontend/src/app/timeline/menus/timelineFilterActions.ts`.

### Phase `W04.P13` - store-produced presentation messages

Replace resolved strings near server and view-store boundaries with typed outcomes or message descriptors and remove raw-token fallbacks.

- [ ] `W04.P13.S73` - Replace document query copy with typed messages and locale-aware truncation details; `frontend/src/stores/server/queries/document.ts`.
- [ ] `W04.P13.S74` - Replace pipeline query copy with typed outcomes and safe user concepts; `frontend/src/stores/server/queries/pipeline.ts`.
- [ ] `W04.P13.S75` - Replace operations-panel strings with typed descriptors and actionable recovery; `frontend/src/stores/view/opsPanel.ts`.
- [ ] `W04.P13.S76` - Replace settings-row presentation strings with typed descriptors; `frontend/src/stores/view/settingsControlRow.ts`.
- [ ] `W04.P13.S77` - Replace hover-card and shared relative-time presentation with locale-aware formatters and safe labels; `frontend/src/stores/view/hoverCardContent.ts, frontend/src/stores/server/searchPill.ts`.
- [ ] `W04.P13.S78` - Migrate localized document, listing, dashboard, pipeline, history, change, and workspace query tests against production descriptors and live wire data; `frontend/src/stores/server/queries/document.test.ts, frontend/src/stores/server/queries/listings.test.ts, frontend/src/stores/server/queries/dashboard.test.ts, frontend/src/stores/server/queries/pipeline.test.ts, frontend/src/stores/server/queries/history-github.test.ts, frontend/src/stores/server/queries/gitchanges.test.ts, frontend/src/stores/server/queries/workspaces.test.ts`.
- [ ] `W04.P13.S129` - Replace hover-card store presentation strings and evidence fallbacks with typed descriptors; `frontend/src/stores/view/hoverCard.ts, frontend/src/stores/view/hoverCardEvidence.ts`.
- [ ] `W04.P13.S192` - Migrate view-store presentation tests against real production descriptors and formatters; `frontend/src/stores/view/opsPanel.test.ts, frontend/src/stores/view/statusCard.test.ts, frontend/src/stores/view/nowStrip.test.ts, frontend/src/stores/view/inspector.test.ts, frontend/src/stores/view/settingsControlRow.test.ts, frontend/src/stores/view/workTabChrome.test.ts, frontend/src/stores/view/contextMenu.test.ts, frontend/src/stores/view/provisionActions.test.ts`.
- [ ] `W04.P13.S231` - Replace listing query copy with typed messages and locale-aware counts; `frontend/src/stores/server/queries/listings.ts`.
- [ ] `W04.P13.S232` - Replace dashboard query copy with typed messages and locale-aware summaries; `frontend/src/stores/server/queries/dashboard.ts`.
- [ ] `W04.P13.S233` - Replace history query copy with typed outcomes and safe user concepts; `frontend/src/stores/server/queries/history-github.ts`.
- [ ] `W04.P13.S234` - Replace change query copy with typed outcomes and safe user concepts; `frontend/src/stores/server/queries/gitchanges.ts`.
- [ ] `W04.P13.S235` - Replace workspace query copy with typed outcomes and safe user concepts; `frontend/src/stores/server/queries/workspaces.ts`.
- [ ] `W04.P13.S236` - Replace status-card strings with typed descriptors and actionable recovery; `frontend/src/stores/view/statusCard.ts`.
- [ ] `W04.P13.S237` - Replace now-strip strings with typed descriptors and actionable recovery; `frontend/src/stores/view/nowStrip.ts`.
- [ ] `W04.P13.S238` - Replace inspector strings with typed descriptors and actionable recovery; `frontend/src/stores/view/inspector.ts`.
- [ ] `W04.P13.S239` - Replace work-tab presentation strings with typed descriptors; `frontend/src/stores/view/workTabChrome.ts`.
- [ ] `W04.P13.S240` - Replace context-menu presentation strings with typed descriptors; `frontend/src/stores/view/contextMenu.ts`.
- [ ] `W04.P13.S241` - Replace provision-action presentation strings with typed descriptors; `frontend/src/stores/view/provisionActions.ts`.

## Wave `W05` - authoring viewer settings and auxiliary surfaces

Complete the remaining user-facing application, editor, reader, onboarding, settings, visual-entry, prototype, and lab surfaces without leaving source-language islands.

### Phase `W05.P14` - authoring editor and review

Localize document creation, editing, review, diff, comments, confirmations, conflicts, and mutation feedback with explicit user actions.

- [ ] `W05.P14.S79` - Localize review-station queues, decisions, eligibility, feedback, conflicts, and confirmations; `frontend/src/app/authoring/ReviewStation.tsx`.
- [ ] `W05.P14.S80` - Localize editor toolbar formatting, save, close, and unsaved-change actions; `frontend/src/app/viewer/EditorToolbar.tsx`.
- [ ] `W05.P14.S81` - Localize diff previews, truncation, change summaries, and copy actions without hunk or implementation terminology; `frontend/src/app/authoring/DiffPanel.tsx, frontend/src/app/authoring/diffLines.ts`.
- [ ] `W05.P14.S82` - Localize comment threads, orphaned-anchor states, edit, resolve, delete, and re-anchor actions; `frontend/src/app/viewer/CommentThreadPanel.tsx, frontend/src/app/viewer/readerComments.ts`.
- [ ] `W05.P14.S83` - Replace authoring store mutation messages and served reasons with typed outcomes; `frontend/src/stores/server/authoring/adapters.ts`.
- [ ] `W05.P14.S84` - Migrate review-station and diff tests through production catalogs and real behavior; `frontend/src/app/authoring/ReviewStation.render.test.tsx, frontend/src/app/authoring/DiffPanel.render.test.tsx, frontend/src/app/authoring/diffLines.test.ts`.
- [ ] `W05.P14.S193` - Localize document creation and editor tag-autocomplete messages; `frontend/src/app/viewer/AutocompleteCombobox.tsx, frontend/src/stores/view/editor.ts`.
- [ ] `W05.P14.S194` - Migrate editor-toolbar and tag behavior tests through production catalogs; `frontend/src/app/viewer/EditorToolbar.render.test.tsx, frontend/src/app/viewer/editorTags.test.ts`.
- [ ] `W05.P14.S195` - Migrate comment-thread and reader-comment tests through production catalogs; `frontend/src/app/viewer/ReaderComments.render.test.tsx, frontend/src/app/viewer/readerComments.test.ts`.
- [ ] `W05.P14.S216` - Replace editor store mutation and unsaved-change messages with typed outcomes; `frontend/src/stores/view/editor.ts`.

### Phase `W05.P15` - viewer and document presentation

Localize readers, code views, metadata, hover content, language names, truncation notices, and document navigation wrappers.

- [ ] `W05.P15.S85` - Localize Markdown reader states, controls, truncation notices, and accessible navigation; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [ ] `W05.P15.S86` - Localize document chrome, properties, metadata, and viewer menu labels; `frontend/src/app/viewer/DocChrome.tsx, frontend/src/app/viewer/PropertiesPopover.tsx`.
- [ ] `W05.P15.S87` - Replace bundled language, code-fence, and badge display names with locale catalog mappings; `frontend/src/app/viewer/languages.ts`.
- [ ] `W05.P15.S88` - Localize Markdown document presentation while preserving titles, paths, headings, and user-authored content as data; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [ ] `W05.P15.S89` - Migrate Markdown and code reader tests through production catalogs; `frontend/src/app/viewer/MarkdownReader.test.tsx, frontend/src/app/viewer/CodeViewer.test.tsx, frontend/src/app/viewer/MarkdownDocView.render.test.tsx`.
- [ ] `W05.P15.S196` - Localize related-document selection and autocomplete controls; `frontend/src/app/viewer/RelatedDocPicker.tsx, frontend/src/app/viewer/AutocompleteCombobox.tsx`.
- [ ] `W05.P15.S197` - Localize plan summary labels and states without exposing internal metadata; `frontend/src/app/viewer/PlanSummaryCard.tsx`.
- [ ] `W05.P15.S198` - Migrate document chrome, properties, and related-document tests through production catalogs; `frontend/src/app/viewer/DocChrome.render.test.tsx, frontend/src/app/viewer/PropertiesPopover.render.test.tsx, frontend/src/app/viewer/RelatedDocPicker.render.test.tsx`.
- [ ] `W05.P15.S199` - Migrate highlighted-code and highlighter-theme tests through production locale behavior; `frontend/src/app/viewer/HighlightedCode.test.tsx, frontend/src/app/viewer/highlighterTheme.test.tsx, frontend/src/app/viewer/useHighlighter.test.ts`.
- [ ] `W05.P15.S242` - Localize code viewer states, controls, truncation notices, and accessible navigation; `frontend/src/app/viewer/CodeViewer.tsx`.

### Phase `W05.P16` - settings onboarding and responsive surfaces

Localize settings controls, first-run onboarding, compact layouts, and remaining responsive chrome.

- [ ] `W05.P16.S90` - Localize settings dialog categories, descriptions, inheritance, reset, and validation copy; `frontend/src/app/settings/SettingsDialog.tsx, frontend/src/stores/view/settingsControls.ts`.
- [ ] `W05.P16.S91` - Localize first-run onboarding, project setup, progress, refusal, and recovery copy; `frontend/src/app/onboarding/FirstRunOnboarding.tsx`.
- [ ] `W05.P16.S92` - Localize compact application shell navigation and accessibility text; `frontend/src/app/shell/CompactAppShell.tsx`.
- [ ] `W05.P16.S93` - Migrate settings dialog and effect tests through production catalogs; `frontend/src/app/settings/SettingsDialog.render.test.tsx, frontend/src/app/settings/settingsEffects.test.tsx, frontend/src/app/settings/useSettingsDialog.test.ts`.
- [ ] `W05.P16.S200` - Localize settings control labels, options, validation, and accessible descriptions; `frontend/src/app/settings/controls/`.
- [ ] `W05.P16.S201` - Localize compact document-reader controls and accessibility text; `frontend/src/app/shell/CompactDocReader.tsx`.
- [ ] `W05.P16.S202` - Localize compact unified-rail sections, actions, and accessibility text; `frontend/src/app/shell/CompactUnifiedRail.tsx`.
- [ ] `W05.P16.S203` - Localize compact timeline controls and status text; `frontend/src/app/shell/CompactTimeline.tsx`.
- [ ] `W05.P16.S204` - Migrate settings-control and theme tests through production catalogs; `frontend/src/app/settings/controls/controls.render.test.tsx, frontend/src/app/settings/controls/KeybindingControl.test.tsx, frontend/src/app/settings/themeSetting.test.tsx`.
- [ ] `W05.P16.S205` - Migrate onboarding render tests through production catalogs; `frontend/src/app/onboarding/FirstRunOnboarding.render.test.tsx`.
- [ ] `W05.P16.S206` - Migrate compact-shell and bottom-navigation tests through production catalogs; `frontend/src/app/shell/CompactUnifiedRail.render.test.tsx, frontend/src/app/shell/BottomTabBar.test.tsx`.

### Phase `W05.P17` - auxiliary and visual entry points

Localize or production-fence prototype, visual-review, graph, status, filters, viewer, and three-lab entry points so no shipped frontend leaks developer state.

- [ ] `W05.P17.S94` - Localize or production-fence the status-gallery prototype entry point; `frontend/src/prototype/StatusGallery.tsx, frontend/src/prototype/main.tsx`.
- [ ] `W05.P17.S95` - Localize the graph visual-review entry point through production catalogs; `frontend/src/graph-visual/main.tsx`.
- [ ] `W05.P17.S96` - Localize or explicitly development-fence three-lab appearance controls and descriptions; `frontend/src/three-lab/AppearancePanel.tsx`.
- [ ] `W05.P17.S97` - Prove visual-review entry points never expose message keys, development metadata, raw tokens, or untranslated English; `frontend/src/graph-visual/main.tsx, frontend/src/filters-visual/main.tsx, frontend/src/status-visual/main.tsx, frontend/src/viewer-visual/main.tsx`.
- [ ] `W05.P17.S207` - Localize or production-fence the standalone prototype HTML shell; `frontend/prototype.html`.
- [ ] `W05.P17.S208` - Localize the filter visual-review entry point through production catalogs; `frontend/src/filters-visual/main.tsx`.
- [ ] `W05.P17.S209` - Localize the status visual-review entry point through production catalogs; `frontend/src/status-visual/main.tsx`.
- [ ] `W05.P17.S210` - Localize the viewer visual-review entry point through production catalogs; `frontend/src/viewer-visual/main.tsx`.
- [ ] `W05.P17.S211` - Localize or explicitly development-fence the three-lab graph surface; `frontend/src/three-lab/ThreeLab.tsx, frontend/src/three-lab/main.tsx`.
- [ ] `W05.P17.S212` - Localize or production-fence the standalone three-lab HTML shell; `frontend/three.html`.
- [ ] `W05.P17.S213` - Prove prototype entry points never expose message keys, development metadata, raw tokens, or untranslated English; `frontend/src/prototype/StatusGallery.tsx, frontend/src/prototype/main.tsx, frontend/prototype.html`.
- [ ] `W05.P17.S214` - Prove three-lab entry points never expose message keys, development metadata, raw tokens, or untranslated English; `frontend/src/three-lab/AppearancePanel.tsx, frontend/src/three-lab/ThreeLab.tsx, frontend/src/three-lab/main.tsx, frontend/three.html`.

## Wave `W06` - zero-literal enforcement and release verification

Close every temporary exemption, prove catalog and copy invariants, exercise the live application, and pass formal review before declaring the campaign complete.

### Phase `W06.P18` - close the zero-literal guard

Remove every migration exemption and make untranslated rendered copy, fixed locales, unsafe fallbacks, em dashes, and prohibited vocabulary fail the standard gate.

- [ ] `W06.P18.S98` - Remove every temporary scanner exemption and require zero production user-facing literals; `frontend/scripts/scan-localization.mjs`.
- [ ] `W06.P18.S99` - Delete superseded English label maps after their catalog replacements land; `frontend/src/`.
- [ ] `W06.P18.S100` - Reject em dashes and invalid ellipsis punctuation in locale resources and production copy; `frontend/src/localization/catalogPunctuation.test.ts, frontend/scripts/scan-localization.mjs`.
- [ ] `W06.P18.S101` - Run the source guard across every production and auxiliary frontend entry point and repair all findings; `frontend/src/, frontend/*.html`.
- [ ] `W06.P18.S130` - Define the canonical operation-to-verb inventory and reject divergent synonyms across action IDs; `frontend/src/localization/actionVocabulary.test.ts`.
- [ ] `W06.P18.S131` - Prove every typed error and status condition maps exhaustively to actionable copy or a safe fallback; `frontend/src/localization/outcomeMessages.test.ts`.
- [ ] `W06.P18.S132` - Remove manual title-casing and CSS-authored capitalization from user-facing presentation paths; `frontend/src/, frontend/src/styles.css`.
- [ ] `W06.P18.S133` - Remove manual singular, plural, and count sentence construction from production presentation paths; `frontend/src/`.
- [ ] `W06.P18.S134` - Remove fixed-locale and manual month formatting from production presentation paths; `frontend/src/`.
- [ ] `W06.P18.S135` - Reject prohibited internal and development vocabulary in catalog values and rendered fallback mappings; `frontend/src/localization/catalogVocabulary.test.ts`.
- [ ] `W06.P18.S136` - Reject raw exception, token, identifier, path, command, and served-reason interpolation into general UI messages; `frontend/src/localization/catalogSafety.test.ts`.
- [ ] `W06.P18.S137` - Reject English call-site defaults, dynamic message keys, and concatenated translated fragments; `frontend/scripts/scan-localization.mjs`.

### Phase `W06.P19` - real-behavior and live-browser verification

Exercise production resources, components, accessibility output, locale switching, formatting, and the real served application across all state modes.

- [ ] `W06.P19.S102` - Run catalog, runtime, formatter, descriptor, error-safety, and locale-reactivity suites against production resources; `frontend/src/localization/, frontend/src/platform/localization/`.
- [ ] `W06.P19.S103` - Run all copy-sensitive component suites across every migrated domain without mocks, fakes, stubs, patches, skip, or xfail; `frontend/src/app/`.
- [ ] `W06.P19.S104` - Exercise the live served application in its typical localized state; `frontend/e2e/localization-typical.spec.ts`.
- [ ] `W06.P19.S105` - Verify expanded and right-to-left test locale behavior for layout, focus, rich interpolation, live regions, lang, and dir; `frontend/e2e/localization-layout.spec.ts`.
- [ ] `W06.P19.S106` - Run the complete frontend test recipe against the real live-engine harness; `frontend/`.
- [ ] `W06.P19.S107` - Run the complete frontend lint recipe including formatting, TypeScript, ESLint, and localization enforcement; `frontend/`.
- [ ] `W06.P19.S138` - Expand the bounded alternate-locale resources for full expanded-copy and right-to-left browser verification; `frontend/src/localization/testing/`.
- [ ] `W06.P19.S139` - Exercise live loading and progressive-result states without untranslated text or unresolved placeholders; `frontend/e2e/localization-loading.spec.ts`.
- [ ] `W06.P19.S140` - Exercise live degraded states and prove every visible effect and recovery action is user-facing; `frontend/e2e/localization-degraded.spec.ts`.
- [ ] `W06.P19.S141` - Exercise live empty states and prove concise localized guidance across primary surfaces; `frontend/e2e/localization-empty.spec.ts`.
- [ ] `W06.P19.S142` - Exercise production error boundaries and prove raw diagnostics never render in any build mode; `frontend/e2e/localization-errors.spec.ts`.
- [ ] `W06.P19.S143` - Exercise destructive confirmations and prove explicit consequence, destructive verb, and safe cancel wording; `frontend/e2e/localization-confirmations.spec.ts`.
- [ ] `W06.P19.S144` - Exercise menus, commands, and shortcuts and prove shared action wording and canonical verbs; `frontend/e2e/localization-actions.spec.ts`.
- [ ] `W06.P19.S145` - Exercise compact and responsive surfaces and prove localized accessible navigation without source-language leakage; `frontend/e2e/localization-responsive.spec.ts`.

### Phase `W06.P20` - formal review and remediation

Audit the entire campaign against the ADR and original objective, repair every required finding, and close the plan only after independent re-verification.

- [ ] `W06.P20.S108` - Scaffold and perform a formal localization code review against the accepted ADR and original campaign objective; `.vault/audit/2026-07-14-frontend-localization-audit.md, frontend/src/, frontend/scripts/, frontend/e2e/`.
- [ ] `W06.P20.S109` - Repair every critical, high, and required review finding before forward completion; `frontend/src/, frontend/scripts/, frontend/e2e/`.
- [ ] `W06.P20.S110` - Repeat full test, lint, live-browser, catalog, and zero-literal checks after remediation; `frontend/`.
- [ ] `W06.P20.S111` - Audit catalog completeness and source-literal evidence against the accepted requirements; `.vault/audit/2026-07-14-frontend-localization-audit.md, .vault/plan/2026-07-14-frontend-localization-plan.md, frontend/src/localization/, frontend/scripts/`.
- [ ] `W06.P20.S156` - Audit canonical action verbs and cross-ID synonym evidence against the accepted requirements; `.vault/audit/2026-07-14-frontend-localization-audit.md, frontend/src/localization/, frontend/src/stores/view/`.
- [ ] `W06.P20.S157` - Audit concise plain-language error, status, confirmation, actionability, and diagnostic-safety evidence against the accepted requirements; `.vault/audit/2026-07-14-frontend-localization-audit.md, frontend/src/localization/, frontend/src/platform/errors/, frontend/e2e/localization-errors.spec.ts, frontend/e2e/localization-confirmations.spec.ts`.
- [ ] `W06.P20.S158` - Audit locale-sensitive formatting and reactive locale behavior evidence against the accepted requirements; `.vault/audit/2026-07-14-frontend-localization-audit.md, frontend/src/localization/, frontend/src/platform/localization/, frontend/e2e/localization-layout.spec.ts`.
- [ ] `W06.P20.S159` - Audit visible, accessible, responsive, auxiliary, and right-to-left surface evidence against the accepted requirements; `.vault/audit/2026-07-14-frontend-localization-audit.md, frontend/src/, frontend/e2e/`.
- [ ] `W06.P20.S160` - Audit test, lint, live-browser, and formal-review evidence before closing the campaign; `.vault/audit/2026-07-14-frontend-localization-audit.md, .vault/plan/2026-07-14-frontend-localization-plan.md, frontend/`.

## Parallelization

Waves are ordered. W01 establishes the runtime and authority consumed by every later
Wave. W02 changes shared presentation contracts and must pass review before leaf-domain
migration begins. Within W03, P07, P08, and P09 can run concurrently after their shared
contracts land. Within W04, P10, P11, and P12 can run concurrently; P13 follows because
it reconciles their store-produced messages. Within W05, P14, P15, P16, and P17 can run
concurrently when their file scopes do not overlap. W06 is ordered: close enforcement,
run real-behavior verification, then perform formal review and remediation.

Terra high or extra-high executors own mechanical catalog population, component string
migration, and test expectation updates. Sol executors own runtime bootstrapping, typed
descriptor contracts, settings and wire decisions, safe error policy, enforcement
architecture, and review-critical revisions. Each Phase retains one file-ownership
fence, and existing unrelated work is rebased or avoided rather than overwritten.

## Verification

- Every shipped locale has the complete typed key set with matching interpolation
  variables, valid plurals, and no unresolved messages.
- The localization source scanner reports zero user-facing literals across production
  and auxiliary frontend entry points, with no broad legacy allowlist.
- Catalogs and rendered output contain no em dashes, raw diagnostics, internal service
  vocabulary, development state, manufactured raw-token labels, or unsafe English
  defaults.
- Every user-facing message is concise, clear, understandable without development
  knowledge, and actionable whenever the user can recover or choose a next step.
- Commands, menus, keybindings, confirmations, and mobile affordances resolve the same
  canonical message for the same action ID and use imperative sentence-case wording.
- Numbers, dates, lists, durations, relative times, percentages, byte sizes, and plurals
  respond to the active locale; locale changes rerender without refetching wire data.
- Real production component tests prove safe loading, degraded, empty, error,
  confirmation, and accessibility output without mocks, fakes, stubs, patches, `skip`,
  or `xfail`.
- The live-origin localization browser suites pass for desktop, compact, expanded-copy,
  and right-to-left scenarios with correct `lang`, `dir`, focus, and live regions.
- `just dev test frontend` and `just dev lint frontend` both exit zero after the final
  remediation pass.
- A formal code review records no unresolved critical, high, or required findings, and
  every active Step is closed through the plan CLI.
