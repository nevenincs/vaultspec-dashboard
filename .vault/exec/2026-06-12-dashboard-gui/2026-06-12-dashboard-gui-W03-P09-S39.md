---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S39'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# wire bidirectional selection between browser and stage per G2.b

## Scope

- `frontend/src/app/left/browserSelection.ts`

## Description

- Add `frontend/src/app/left/browserSelection.ts`: id derivation joining
  the browser and the graph on the contract's identity guarantee (document
  node ids derive from the vault stem - `pathToNodeId`/`nodeIdToStem`,
  pure and tested).
- Browser → stage: row clicks call the shared `selectNode`; the S23
  binding focuses the node on the field.
- Stage → browser: `useHighlightedPath` resolves the shared selection to
  its browser row (document selections only); the browser default-wires
  both directions, with props overriding for embedding contexts.
- Add `frontend/src/app/left/browserSelection.test.ts` covering the id
  round-trip, click-to-selection, and selection-to-row highlighting
  including the non-document and empty cases.

## Outcome

Selection is one concept across browser and stage in both directions;
phase W03.P09 (left rail) is complete. Gates green: typecheck, eslint,
vitest (180 passed), prettier.

## Notes

Scroll-into-view on highlight is a polish item for the a11y pass (S48)
where focus management is handled coherently.
