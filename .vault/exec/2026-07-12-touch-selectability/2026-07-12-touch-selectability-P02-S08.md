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




# Re-enable text selection on worktree, project, and recent row data text and route the worktree menu through the selection guard

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description


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

