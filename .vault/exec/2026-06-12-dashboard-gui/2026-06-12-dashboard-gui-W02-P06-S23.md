---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S23'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement the shared selection concept syncing stage, view store, browser, timeline, and inspector per G2.b

## Scope

- `frontend/src/stores/view/selection.ts`

## Description

- Type the shared selection in the view store: node, edge, or event (event
  selections carry their `nodeIds` join field for the stage
  cross-highlight); `selectedId` mirrors the id for convenience and
  back-compat.
- Add `frontend/src/stores/view/selection.ts`: the region-facing actions
  (`selectNode`, `selectEvent`, `selectEdge`), the stage's own
  `selectFromScene` path, and `bindSelectionToScene` - store selections
  from other regions become seam `focus-node` commands (events focus their
  first carried node).
- Origin discipline: stage-originated selections never bounce a focus
  command back at the camera the user is already pointing - only
  cross-region selections focus, verified by test.
- Rewire the stage to the new paths and bind the store to the scene at
  mount.
- Add `frontend/src/stores/view/selection.test.ts` covering kind
  mirroring, cross-region focus, event-carried focus, and the
  no-bounce-back rule.

## Outcome

Selection is one concept: the browser (S39), timeline (S36), search, and
palette all call the same actions and the stage follows; the inspector
(S42) reads the same slice. Gates green: typecheck, eslint, vitest (122
passed), prettier.

## Notes

The stage cross-highlight pulse for event selections is S36's; the binding
already focuses the carried node.

