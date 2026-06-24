---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S11'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace keyboard-navigation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-06-21-keyboard-navigation-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Enroll the worktree picker (trigger + popover list) onto FocusZone and ## Scope

- `arrow-navigate rows`
- `Enter select`
- `Escape restores to trigger`
- `live-verify`
- `frontend/src/app/left/WorktreePicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Enroll the worktree picker (trigger + popover list) onto FocusZone

## Scope

- `arrow-navigate rows`
- `Enter select`
- `Escape restores to trigger`
- `live-verify`
- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- The worktree picker file had settled (committed/clean, no active concurrent edits — the filter campaign's `FilterSidebar` was still dirty, but `WorktreePicker` was safe), so enrolled it onto `useFocusZone`: replaced the bespoke roving (a `rowEls` map + `registerRow` ref callback + `worktreePickerRowKeyboardTarget` arrow math) with the shared zone — the dropdown is ONE tab stop, rows rove by arrows.
- Fixed the missing `stopPropagation` (the bespoke handler leaked arrows to the global graph-nav). Kept Shift+F10 context menu, Enter/Space select, Escape collapse; the trigger's ArrowDown-to-dive now uses `zone.focusItem`. The concurrent agent's Popover focus-return-to-trigger is preserved.

## Outcome

- The dropdown is one tab stop and the row carries the FocusZone tab stop; tsc/eslint/prettier clean, WorktreePicker tests (6) green. Live-verified via the own-Chromium harness: opening the dropdown shows the row as `tabIndex 0`.

## Notes

- This repo's scope resolves to a SINGLE worktree, so multi-row arrow roving could not be exercised in this environment (one row = nothing to rove to). The conversion is the exact pattern proven live across the trees/step tree/mark cursor; with >1 worktree it roves identically.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
