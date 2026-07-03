---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S01'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Thread the active-project label, pending-aware headline worktree, and per-row branch label through the picker presentation view, and rewrite user-facing strings in plain sentence case (drop scope, workspace, vault-bearing, bare)

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add `projectLabel` (threaded from the registry) and pending-aware `headline` to `WorkspaceMapPickerPresentationView`; `allLabel` now names the project ("Worktrees in X").
- Add `branchLabel` to `WorkspaceMapPickerRowView` (null when the branch equals the folder name); rename `bareLabel` to `noVaultLabel` ("·no vault").
- Add `label` to `WorktreePickerRecentRowView`: cross-project rows lead with the project ("project / worktree").
- Rewrite trigger/list/row aria and state strings in plain sentence case; drop "scope", "workspace map", "vault-bearing"; retitle the no-scope and code-tree empty copy.
- Delete `LocationAnchorView`, `deriveLocationAnchor`, and `useLocationAnchor` outright (no bridge).

## Outcome

The presentation view carries everything the trigger and dropdown need to state identity; no consumer reads raw map/status for location. Full lint gate and the stores suite (248 tests) pass.

## Notes

None.
