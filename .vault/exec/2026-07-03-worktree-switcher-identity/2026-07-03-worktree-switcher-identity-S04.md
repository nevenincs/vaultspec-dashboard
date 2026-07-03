---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S04'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Lead cross-project recent rows with the project in the navigator popup via the shared row label

## Scope

- `frontend/src/app/left/ProjectNavigator.tsx`

## Description

- Render the shared recent-row label in the project navigator popup, replacing the name-plus-faint-suffix layout so cross-project rows lead with the project.

## Outcome

The navigator and the picker dropdown present recents identically. Navigator render suite passes live.

## Notes

None.
