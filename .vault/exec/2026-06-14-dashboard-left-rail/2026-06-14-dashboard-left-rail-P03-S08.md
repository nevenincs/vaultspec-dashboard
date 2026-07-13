---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Issue no wire request from the filter and clear it on scope swap

## Scope

- `frontend/src/app/left/`

## Description

- Confirm the filter issues no wire request: it only sets store state read by the dumb browser views; no query is keyed on it.
- Clear the filter on scope swap via the browser-mode store reset wired into setScope / swapWorkspace.

## Outcome

The filter issues no fetch and clears on both worktree and workspace swaps; proven by the isolation-05 adversarial test and the LeftRail no-wire render assertion.

## Notes

The no-wire property is asserted by spying the real transport across a filter change in the render test.
