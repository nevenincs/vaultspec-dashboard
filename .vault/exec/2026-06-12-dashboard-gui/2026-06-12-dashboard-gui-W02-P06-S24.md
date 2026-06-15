---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S24'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement open-in-place feature lifecycle and plan interior islands with canonical lifecycle-axis and tier layouts per G3.b and G3.e

## Scope

- `frontend/src/app/islands/NodeInterior.tsx`

## Description

- Add `frontend/src/app/islands/NodeInterior.tsx`: opened nodes unfold in
  place inside their DOM islands, with canonical layouts - never
  force-directed (G3.e).
- Feature interiors render the document lifecycle along the canonical axis
  (research, adr, plan, exec, audit) from the neighbors query; pure
  `lifecycleRank`/`arrangeLifecycleAxis` order them and drop non-document
  neighbors.
- Plan interiors render the engine's interior subgraph as tiered step rows
  in canonical identifier order with check state and the progress
  fraction; pure `interiorSteps` extracts them.
- Every unfolded entry clicks through the shared selection (`selectNode`);
  other node kinds get a metadata summary.
- The island shell (S15) now renders `NodeInterior` as its default
  content; the placeholder is gone.
- Add `frontend/src/app/islands/NodeInterior.test.ts` for the canonical
  ordering helpers.

## Outcome

Open-in-place works end-to-end: double-click a feature on the stage, the
island unfolds its lifecycle; open a plan, its steps with check state.
Gates green: typecheck, eslint, vitest (126 passed), prettier.

## Notes

The fixture interiors are flat step lists; wave/phase grouping in the plan
interior layout activates when the engine serves W##/P## identifiers in
interior nodes (mock follows the contract's shape either way).

