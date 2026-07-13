---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S09'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Author the shared sort + reset-sorting action descriptors (`left-rail:sort-*`, `left-rail:reset-sorting`) and palette enrollment

## Scope

- `frontend/src/stores/view/leftRailKeybindings.ts`

## Description

- `sortTreeActions()` (one descriptor per option, `left-rail:sort-*`) + `resetSortingAction` (`left-rail:reset-sorting`) in `leftRailKeybindings.ts`
- Palette enrollment in `buildLeftRailCommands` from the same builders

## Outcome

Guard suites (actionCoverage, commandPalette) green after expectation update.

## Notes

None.
