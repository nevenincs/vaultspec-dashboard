---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement the React island layer rendering opened nodes at tracked anchors per G6.a

## Scope

- `frontend/src/app/islands/IslandLayer.tsx`

## Description

- Add `frontend/src/app/islands/IslandLayer.tsx`: the DOM overlay layer
  above the GPU field. `IslandLayer` renders one island per opened node id;
  the layer is pointer-transparent, islands themselves interactive.
- Implement `useNodeAnchor`: each island subscribes to its node's screen
  anchor through the seam's `trackNode` - React receives epsilon-gated
  anchor changes only, never per-frame state (the §5.2 boundary).
- Implement `islandStyle` as a pure, tested function: hidden without an
  anchor (node off stage), transform-positioned from the anchor, island
  scale clamped to a readable band rather than tracking field zoom 1:1.
- Add `openedIds` with `openNode`/`closeNode` to the view store - the
  open-in-place state the layer renders and W02.P06.S24's interiors build
  on; islands carry a placeholder shell with a close affordance until then.
- Add `frontend/src/app/islands/IslandLayer.test.ts` covering the style
  function and the opened-set store actions.

## Outcome

The hybrid architecture per G6.a is complete end-to-end: GPU field below,
React islands above, bridged exclusively by the anchor subscription. Gates
green: typecheck, eslint, vitest (80 passed), prettier.

## Notes

Component-level render tests need a DOM test environment the scaffold does
not carry (vitest runs in node); the pure style/hook seams are tested and
DOM verification rides the S21 stage mount plus the W03.P12.S50 e2e smoke.
Island content is a placeholder shell by design - interiors are
W02.P06.S24.
