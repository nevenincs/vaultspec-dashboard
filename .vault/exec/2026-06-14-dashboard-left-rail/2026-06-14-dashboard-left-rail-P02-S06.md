---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Re-key the chosen mode per scope and wire it into the wholesale reset

## Scope

- `frontend/src/stores/view/`

## Description

- Add `stores/view/browserMode`: per-scope `mode` and `filter` view-local state, `resetForScope`, and the imperative `resetBrowserMode` seam.
- Wire `resetBrowserMode()` into `viewStore.setScope` and `viewStore.swapWorkspace` so the mode and filter are re-keyed per scope and cleared on every wholesale swap.

## Outcome

The chosen mode is re-keyed per scope and wired into both the worktree and workspace wholesale resets; committed.

## Notes

Switching mode clears the filter (a filter is scoped to its mode). The reset lives in the stores layer only; the rail control never resets it (single navigation law).
