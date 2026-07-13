---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W03.P06` summary

Steps S18-S20 delivered the in-editor draft-vs-saved diff panel end-to-end: store state, UI wiring, and test coverage.

Modified files:
- `frontend/src/stores/view/viewStore.ts` — `editorBaseText` / `editorDiffVisible` fields; `openEditor` capture; `closeEditor` / `closeDoc` / `closeAllDocs` teardowns; `toggleEditorDiff` method.
- `frontend/src/stores/view/editor.ts` — `DocumentEditorView` surfaces `baseText` / `diffVisible`; exported `toggleEditorDiff` thunk.
- `frontend/src/stores/view/editorKeybindings.ts` — `EDITOR_TOGGLE_DIFF_ACTION_ID` / `EDITOR_TOGGLE_DIFF_LABEL` constants; `Mod+Shift+D` `KeybindingDef`; `registerKeyAction` thunk; cleanup.
- `frontend/src/stores/view/commandPaletteCommands.ts` — `toggleDiff` intent added to `buildEditorCommands()`.
- `frontend/src/stores/view/commandProviders/editorCommandProvider.ts` — `toggleEditorDiff` wired as `intents.toggleDiff`.
- `frontend/src/app/viewer/MarkdownDocView.tsx` — `GitCompare` `IconButton` toolbar entry; `DiffLinesView` collapsible section.
- `frontend/src/stores/view/commandPaletteCommands.test.ts` — updated assertions for new `editor:toggle-diff` command.
- `frontend/src/app/viewer/MarkdownDocView.render.test.tsx` — S20 diff panel render tests + enrollment guard suite.

## Description

Phase W03.P06 implements the authoring-surface ADR D4 diff capability. S18 extended the view store with `editorBaseText` (frozen at editor open) and `editorDiffVisible` (toggle state), surfaced through `DocumentEditorView` as raw primitives. S19 wired the single `editor:toggle-diff` action descriptor into the keymap registry (chord `Mod+Shift+D`), the command palette (family "edit", Title Case label), and the toolbar (sentence case label, `GitCompare` Lucide icon with `active` pressed state); it conditionally mounts `DiffLinesView` as a collapsible section above the textarea without any new wire calls. S20 covered the feature with 7 render/guard tests (5 diff panel + 2 enrollment) and updated the palette command test. Gate: `just dev lint frontend` exit 0, 11/11 viewer tests, 17/17 palette tests.

**Post-review MEDIUM fix:** `editorBaseText` was never advanced when a save completed, so the diff was comparing against the open-time snapshot rather than the last-saved text. Fixed by adding `savedText: string` to `markSaved` / `markEditorSaved` / `applyEditorWriteResult` and threading the draft captured at mutation time through all three save paths (`editorKeybindings.ts` keymap save, `MarkdownDocView.tsx` body save, `MarkdownDocView.tsx` frontmatter save — the last passes the pre-mutation `editorBaseText` snapshot to keep the body diff base unchanged). Additional files touched in the fix: `frontend/src/stores/server/editorMutations.test.ts` (6 call-site updates) and `frontend/src/stores/view/editor.test.ts` (2 new tests for normal save and edit-during-save race). Gate re-confirmed: exit 0, 20/20 tests green across both test files.
