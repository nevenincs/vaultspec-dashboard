---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Add an `active_workspace_root` helper to the app state: it reads the active-workspace id from the user-state config and returns its registered root path, falling back to the launch workspace root when no registry selection exists.
- Change the scope-validation membership check to discover and enumerate the active workspace's worktrees instead of the frozen launch workspace, so a requested worktree is resolved against the active workspace's enumerable worktrees.
- Update the refusal messages to name the active workspace honestly.

## Outcome

Scope routing follows the active workspace: a worktree of a non-active workspace is not selectable until that workspace is made active, and the single-workspace behaviour is unchanged because the active workspace defaults to the launch workspace. Proven by a route-level test that switches the active workspace and validates a sibling worktree only after the switch.

## Notes

The change is read-only over repository content (discover + enumerate), keeping the read-and-infer fence intact. The helper lives on the app state per the plan's file intent; the membership check it feeds lives in the warm-scope module where the symbol already was.
