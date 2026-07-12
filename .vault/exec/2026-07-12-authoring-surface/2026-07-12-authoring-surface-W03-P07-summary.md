---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W03.P07` summary

Steps S21-S27 delivered the reading-mode accelerator hints, the copy-link verb, the visible create actions across the empty state and the rail, the corpus-fed feature combobox in the create dialog, and full render/guard coverage — every create affordance dispatching the one shared new-document descriptor, and copy-link enrolled once across the menu and the palette.

Created files:

- `frontend/src/stores/view/documentLinkActions.ts` — the shared `copyLinkAction` builder + wiki-link helper.
- `frontend/src/stores/view/commandProviders/documentCommandProvider.ts` — the doc-scoped palette provider.
- `frontend/src/app/viewer/DocChrome.render.test.tsx`, `frontend/src/app/stage/WorkspaceGhost.render.test.tsx`, `frontend/src/app/left/BrowserRegion.render.test.tsx`, `frontend/src/stores/view/documentLinkActions.test.ts`, `frontend/src/stores/view/newDocumentAction.test.ts`, `frontend/src/stores/view/commandProviders/documentCommandProvider.test.ts` — test coverage.

Modified files:

- `frontend/src/app/viewer/DocChrome.tsx` — accelerator hints derived from the keymap catalog.
- `frontend/src/app/left/menus/vaultDocMenu.ts`, `frontend/src/app/menus/registerAllCommands.ts` — copy-link menu + palette enrolment.
- `frontend/src/stores/view/commandPaletteCommands.ts`, `frontend/src/stores/view/commandRegistry.ts`, `frontend/src/stores/server/liveAdapters/historyIdentity.ts` — the `activeDocumentStem` context seam + reverse doc-id grammar.
- `frontend/src/app/stage/WorkspaceGhost.tsx`, `frontend/src/app/left/BrowserRegion.tsx` — the empty-state and rail-header create buttons.
- `frontend/src/app/left/TreeBrowser.tsx`, `frontend/src/stores/view/createDocChrome.ts`, `frontend/src/stores/view/leftRailKeybindings.ts` — the Features-section scoped create + one-shot feature-focus intent.
- `frontend/src/app/left/CreateDocDialog.tsx`, `frontend/src/app/viewer/AutocompleteCombobox.tsx` — the corpus-fed feature combobox + optional host-submit hook.
- `frontend/src/app/left/menus/leftMenus.test.ts`, `frontend/src/app/left/CreateDocDialog.render.test.tsx` — updated guards/tests.

## Description

Phase W03.P07 implements authoring-surface ADR D3, D5, and D6. S21 surfaces the view/edit-toggle and close-editor chords as Kbd hints on the doc chrome, derived from the keymap catalog so they honour overrides and never drift. S22 authors one `vault-doc:copy-link` descriptor (run-based, so valid on both planes) copying the app's wiki-link reference — the only navigable document reference, since no URL scheme exists — enrolled on the vault-doc menu and, via a new document command provider keyed on a new optional `activeDocumentStem` context field, on the palette only when a document is open. S23/S24 add visible New-document buttons to the workspace empty state and the vault-mode rail header. S25 adds a Features-section scoped create Plus that opens the dialog with a one-shot feature-focus request carried through the same shared descriptor. S26 swaps the create dialog's feature input for the shared corpus-fed autocomplete combobox (free text preserved for new tags) and adds an optional host-submit hook so Enter still submits when the list is closed. S27 covers every affordance with render/guard tests, including the single-descriptor law and copy-link's dual-plane presence.

Adversarial code review: APPROVED, with one MEDIUM and two LOW follow-ups, all landed. MEDIUM — the reader's wiki-link resolver could not round-trip the section-anchor form the copy-link verb emits (`[[stem#slug]]` folded the fragment into the stem and resolved to no node); the resolver now splits the fragment before resolving, with a test. LOW — a closed-list Enter-to-submit assertion added to the create-dialog suite, and a dedicated guard asserting all three new create buttons route through the shared new-document action.

Verification: the full `just dev lint frontend` gate is green end to end — eslint, px-scan, module-size, prettier, tsc, tokens, and figma:names all pass — after the parallel W03.P06 editor-slice signature migration landed. Every touched test suite is green.
