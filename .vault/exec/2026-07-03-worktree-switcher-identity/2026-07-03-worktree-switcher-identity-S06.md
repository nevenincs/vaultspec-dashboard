---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S06'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Move the live-wire test assertions to the new labels and delete the location-anchor tests

## Scope

- `frontend/src/app/left/WorktreePicker.render.test.tsx`

## Description

- Move the picker render-test queries to the new aria labels (current location / projects and worktrees).
- Update presentation-view string assertions (trigger aria, degraded, empty, single-worktree, no-vault marker, default/current aria) and add locks for the pending-aware headline and the project-led recent label.
- Delete the location-anchor tests and import; update the failure-message and row-fixture assertions in the chrome store suite; align the rail-states fixture copy.

## Outcome

All moved suites pass against the live fixture engine: picker render, chrome store, rail states, view store (48), stores presentation (248), right rail plus navigator and vault browser (80).

## Notes

None.
