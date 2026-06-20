---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S38'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Remove local state fields that duplicate canonical dashboard state after subscribers are migrated

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

- Remove `viewStore` fields and writers for tier filter, timeline mode, panel
  collapse, graph granularity, feature descent, representation mode, and graph
  bounds after their subscribers moved to canonical dashboard-state.
- Stop scope swaps from resetting the legacy filter store or seeding retired
  graph/timeline defaults.
- Reconcile stale tests so remaining `viewStore` coverage only asserts local
  scope affordances, and graph layout/timeline coverage verifies live
  dashboard-state writes instead of local fields.
- Harden the timeline-entry instant helper to emit a finite integer before
  writing `timeline_mode.at` to the backend.
- Route imperative node-selection actions through the canonical dashboard-state
  patch seam and update the TanStack cache for non-React action callers.
- Remove `viewStore.select` and `viewStore.selectedId`; `viewStore.selection`
  now carries only event/edge metadata not yet represented in the backend
  dashboard-state schema.
- Delete the legacy filter Zustand store, leaving `filters.ts` as pure
  dashboard-state projection and visibility compilation helpers.
- Change saved filter lenses into persistence-only named choice snapshots; the
  command palette now applies them by patching canonical dashboard-state filters
  and date range.

## Outcome

- `frontend/src/stores/view/viewStore.ts` no longer carries duplicated
  dashboard-state authorities for filters, timeline, graph granularity, graph
  representation, panel collapse, or bounds.
- `LayoutSelector` writes representation and time-travel mode through the
  TanStack dashboard-state mutation seam and the test now observes the live
  backend state.
- Node navigation from menus, timeline marks, reader links, palette commands,
  and discovery now writes selected node ids to backend dashboard-state instead
  of local `viewStore` selection.
- No production or test code can write node selection through `viewStore` now;
  tests assert the local store only owns event/edge metadata.
- The filter store no longer exists as a local mutable authority; saved lenses
  persist choices and canonical callers decide how to patch dashboard-state.
- Scope switching remains responsible only for local corpus affordances:
  event/edge selection metadata, working set, opened islands, pinned
  discoveries, viewer target, and live-status reset.

## Notes

- Focused verification passed: `npm run typecheck`; scoped ESLint via
  `node node_modules/eslint/bin/eslint.js`; scoped Prettier check; focused
  Vitest for worktree scope reset, context menus, settings effects, graph
  controls, filters, lenses, command palette assembly, and `viewStore` local
  behavior. The final focused Vitest set covered 16 files and 96 tests.
- The focused Vitest run exits 0 but happy-dom prints an `AbortError` during
  teardown after aborting pending fetch cleanup.
- `npx eslint` crashed once in PowerShell shim resolution with a .NET memory
  mapping fatal error; invoking ESLint through the Node entrypoint succeeded.
