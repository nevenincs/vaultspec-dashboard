---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S20'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Tests: the diff toggle renders draft-vs-saved hunks and enrolls in keymap and palette under one id

## Scope

- `frontend/src/app/viewer`

## Description

- Extended `MarkdownDocView.render.test.tsx` with `"MarkdownDocView diff panel (S20)"` suite (5 tests): diff button visible in edit mode; diff section absent before toggle; added hunks rendered after draft diverges from base; toggle collapses section; no button or section in read mode.
- Added `"editor:toggle-diff enrollment guard (S20)"` suite (2 tests): keymap registry carries the `Mod+Shift+D` binding under the canonical id; palette resolves the command under the same id in the "edit" family.
- Updated `commandPaletteCommands.test.ts` to pass the new `toggleDiff` intent to `buildEditorCommands()` and assert the five-command set including `editor:toggle-diff` with `family: "edit"`.
- Imported `editorCommandProvider` as a side-effect in the render test to trigger palette self-registration; added `afterAll(() => resetCommandProviders())` to the enrollment suite to leave a clean registry for subsequent test files.

## Outcome

12/12 viewer tests green (11 original + 1 debounce ceiling-closure test); 17/17 palette command tests green. Full `just dev lint frontend` gate: exit 0 (eslint + prettier + tsc + px-scan + module-size + tokens + figma:names).

## Notes

The lint gate was initially blocked by sibling agent WIP: first by `BrowserRegion.tsx` (S24, resolved by the time the no-cache ESLint run ran — imports were in fact used in JSX), then by `CreateDocDialog.tsx` (S25/S26 prep — unused `AutocompleteCombobox` + `featureOptions`). The S26 agent completed the wiring before I needed to intervene; on re-run the gate cleared. No changes to `BrowserRegion.tsx` or `CreateDocDialog.tsx` were required from this step.

**Ceiling closure:** Added `"MarkdownDocView diff debounce (S19 ceiling closure)"` suite (1 test): opens editor, toggles diff (leading flush — no hunks since draft == base), fires rapid successive draft updates, asserts diff section still shows no added hunks (debounce pending), advances fake timer by 260ms, asserts added hunks now visible. Uses `vi.useFakeTimers()` / `vi.useRealTimers()` in `beforeEach` / `afterEach`.
