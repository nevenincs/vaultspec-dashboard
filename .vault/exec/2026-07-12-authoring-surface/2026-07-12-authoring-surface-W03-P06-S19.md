---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Add the editor toggle-diff action and toolbar button mounting the pure diff-lines view as a collapsible draft-vs-saved section above the textarea

## Scope

- `frontend/src/app/viewer/MarkdownDocView.tsx`

## Description

- Registered `EDITOR_TOGGLE_DIFF_ACTION_ID = "editor:toggle-diff"` and `EDITOR_TOGGLE_DIFF_LABEL = "Toggle draft diff"` in `editorKeybindings.ts` alongside the existing editor action constants.
- Added a `KeybindingDef` for `Mod+Shift+D` to `deriveEditorKeybindings()` — verified free of same-specificity collisions (KAR-008; `Mod+B` reserved, `Mod+I/K` reserved, `Mod+E/S/Alt+W` taken).
- Registered the corresponding `registerKeyAction` thunk in `useEditorKeybindings()`, guarded by `editorTarget !== null`; cleanup added to the return function.
- Added `toggleDiff: () => void` intent to `buildEditorCommands()` in `commandPaletteCommands.ts`; wired `toggleEditorDiff` import in `editorCommandProvider.ts`.
- Added the palette command entry `{ id: "editor:toggle-diff", label: "Toggle Draft Diff", family: "edit", run: intents.toggleDiff }` (Title Case per label-casing convention for palette; sentence case in keymap label).
- Mounted a `GitCompare` `IconButton` (Lucide structural chrome) with `active={editor.diffVisible}` in the `MarkdownDocView` toolbar, bound to `toggleEditorDiff`.
- Rendered a collapsible `<div data-editor-diff-section>` above the textarea that mounts `DiffLinesView` with `base={text: editor.baseText}` vs `proposed={text: editor.draftText}` when `editor.diffVisible` is true; capped to `max-h-64` with `overflow-y-auto`; zero new wire calls.

## Outcome

The diff toggle is a single `ActionDescriptor` enrolled under `editor:toggle-diff` in the keymap (chord `Mod+Shift+D`), the command palette ("Toggle Draft Diff", family "edit"), and the toolbar `IconButton`. Pressing the button or chord expands the diff section; a second press collapses it. The diff section is visible only while the editor is open.

## Notes

Initial prettier formatting run flagged five files (`DocChrome.tsx`, `MarkdownDocView.render.test.tsx`, `commandPaletteCommands.test.ts`, `commandPaletteCommands.ts`, `editorKeybindings.ts`); all reformatted before the lint gate was declared green. `EDITOR_TOGGLE_DIFF_ACTION_ID` was briefly imported in `MarkdownDocView.tsx` but was unused in JSX (only the label is referenced there); removed before the gate run.

**MEDIUM fix (post-review):** `saveBodyNow` and `saveFrontmatterNow` in `MarkdownDocView.tsx` both called `applyEditorWriteResult(result)` with one argument after the signature was updated to require `savedText`. Fixed `saveBodyNow` to capture `useViewStore.getState().draftText` before the mutation and pass it as `savedText`; fixed `saveFrontmatterNow` to pass the pre-mutation `editorBaseText` snapshot so the body diff base stays unchanged after a frontmatter-only save.

**Ceiling closure (accepted LOW):** Per-keystroke O(n·m) line-LCS cost was bounded by adding `useDebouncedDraftText` (component-local hook, ~250ms trailing debounce with immediate leading flush on panel open). `DiffLinesView` receives `debouncedDraft` instead of `editor.draftText`; the textarea remains fully live. No store change required.
