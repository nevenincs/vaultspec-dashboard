---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Re-enable selection on workspace switcher and project navigator row names on the compact shell

## Scope

- `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`

## Description

- Add `select-text` to the workspace/branch name span in `WorkspaceSwitcherSheet`
- Add `select-text` to the recent-entry label span in `ProjectNavigator`

## Outcome

The sole touch-reachable worktree switcher on compact and the desktop recents list both allow long-press name copy; row activation and roving focus are unchanged. Affected suites pass (33 tests).

## Notes

