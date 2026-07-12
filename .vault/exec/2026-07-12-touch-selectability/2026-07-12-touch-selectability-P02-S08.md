---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Re-enable text selection on worktree, project, and recent row data text and route the worktree menu through the selection guard and ## Scope

- `frontend/src/app/left/WorktreePicker.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-enable text selection on worktree, project, and recent row data text and route the worktree menu through the selection guard

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

- Add `select-text` to the shared dropdown row base class the worktree, project, and
  recent rows all derive from (`workspaceMapPickerRowClassName`'s base string), and to
  the trigger pill class carrying the worktree name, branch, and absolute path.
- Wrap the worktree row's `onContextMenu` (the `worktree` resolver — the only one of
  the three row kinds carrying a live menu) with `guardedContextMenu`.

## Outcome

Worktree, project, and recent dropdown rows, plus the trigger's identity block
(name/branch/path), re-enable text selection; the worktree row's context menu yields
to a live intersecting selection.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
