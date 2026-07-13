---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S18'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Retain the opening text as baseText in the editor slice at open, cleared on close

## Scope

- `frontend/src/stores/view/editor.ts`

## Description

- Added `editorBaseText: string` and `editorDiffVisible: boolean` fields to `ViewState` in `viewStore.ts`, with defaults `""` / `false` in `corpusLocalViewState()` and the initial store state.
- Extended `openEditor()` to capture the normalized opening text into `editorBaseText` and initialize `editorDiffVisible: false`.
- Extended `closeEditor()` and `closeDoc()` teardown spreads to reset both new fields to `""` / `false`.
- Added `toggleEditorDiff()` store method that flips `editorDiffVisible` in place.
- Surfaced both fields through `DocumentEditorView` in `editor.ts` as `baseText` and `diffVisible`, selected as raw primitives (store-selector law).
- Exported module-level `toggleEditorDiff()` dispatch thunk from `editor.ts` so keymap and palette can call it outside any render cycle.

## Outcome

`editorBaseText` is frozen at the moment the editor opens and held until the editor closes. `editorDiffVisible` is a plain boolean that survives between keymap dispatch, toolbar click, and palette invocation. Both are raw primitives — safe as direct Zustand selectors.

## Notes

`closeAllDocs()` also needed the teardown spread updated; that path was discovered during review of `closeDoc()` and fixed in the same pass.

**MEDIUM fix (post-review):** `editorBaseText` never advanced on save — after a successful save the diff showed already-persisted content as unsaved hunks. Fixed by threading the committed text through `markSaved(blobHash, savedText)` → `markEditorSaved` → `applyEditorWriteResult`. The text is captured at mutation time (before `.mutate()`) in all three save paths: keymap body save, component body save (`saveBodyNow`), and frontmatter save (passes the `editorBaseText` snapshot so the body diff base stays unchanged). LOW debounce ceiling (diff base may briefly lag behind very rapid saves) accepted as-is — deferred. Two new unit tests cover the normal save and edit-during-save race cases.
