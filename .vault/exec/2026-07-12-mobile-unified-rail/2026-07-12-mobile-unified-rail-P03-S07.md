---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Add pure unit and render tests for the compact rail-sections fold store and the reduced bottom tab bar

## Scope

- `frontend/src/stores/view/compactRailSections.test.ts`
- `frontend/src/app/shell/BottomTabBar.test.tsx`

## Description

- Add a pure unit test for the rail-sections fold store: both sections default open, each toggle flips only its own flag, and reset restores both.
- Add a happy-dom render test for the bottom tab bar: exactly Home, Timeline, and Search render, the active tab carries `aria-current="page"`, and `onSelect` reports the tapped surface id; no Browse or Status tab.

## Outcome

Four fold-store cases and three tab-bar cases, all passing; the only spy is the caller's own `onSelect` (no engine wire mocked). Authored by a delegated Opus coder under supervision.

## Notes

The unified rail's full render is wire-coupled (it mounts the live `StatusTab`); its composition is covered indirectly through the fold store, the tab bar, and the `FoldSection` kit primitive's own tests rather than a heavier live-wire mount.
