---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S37'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the worktree picker over the map endpoint with corpus-bearing worktrees primary and bare refs dimmed per G2.a

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- Add `frontend/src/app/left/WorktreePicker.tsx`: the compact switcher
  over the map endpoint - current worktree always visible, expand for the
  mapped landscape. Corpus-bearing worktrees are primary; bare refs render
  dimmed and disabled with degradation markers (no working tree to resolve
  against); ordering is pure and tested (`orderWorktrees`).
- Add the explicit `scope` to the view store with the wholesale-swap
  semantics G2.a demands: switching scope resets selection, working set,
  and opened islands (tested); `useActiveScope` now prefers the user's
  pick over the map's default; pins and position cache already re-key per
  scope (S08/S27).
- Mount the picker in the left rail, replacing the scaffold placeholder.

## Outcome

The coarsest filter exists: picking a worktree swaps the constellation,
filters vocabulary, vault tree, events, and persistence keys in one move
(all reads key on scope). Gates green: typecheck, eslint, vitest (172
passed), prettier.

## Notes

The mock serves one corpus-bearing worktree and one degraded bare ref;
multi-repository landscapes render as a flat ordered list until real map
data motivates grouping by repository.

