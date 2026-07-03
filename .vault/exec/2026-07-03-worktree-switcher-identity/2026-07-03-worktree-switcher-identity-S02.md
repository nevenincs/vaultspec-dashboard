---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S02'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Rebuild the trigger as the one identity block (project line, hugging chevron, pending-aware git line, path line), align dropdown rows on one leading glyph column, lead cross-project recents with the project, show branch on worktree rows, drop the false listbox promise

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- Rebuild the trigger as the one identity block: faint project line, worktree title with the chevron hugging the text (title no longer flex-1; chevron one step larger), git-status line driven by the pending-aware headline, and a faint mono absolute-path line with the full path as tooltip.
- Give worktree and recent rows a leading branch glyph so all dropdown rows start text on one column; render the per-row branch label; render the shared recent-row label.
- Drop the false listbox popup claim from the trigger; keep aria-expanded + aria-controls.

## Outcome

The left rail states project, worktree, branch, git state, and folder in one glance; dropdown rows are distinguishable when basenames collide. Render suite passes live.

## Notes

None.
