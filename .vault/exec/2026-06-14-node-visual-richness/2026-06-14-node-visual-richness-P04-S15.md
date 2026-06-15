---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S15'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---




# build the hover-card DOM-island variety reusing the node anchor and island styling

## Scope

- `frontend/src/app/islands/IslandLayer.tsx`

## Description

- Build the hover-card DOM-island variety as a new sibling host component beside the opened-island layer, reusing the exported `useNodeAnchor` and `islandStyle` from the existing island module rather than editing it in place — additive, so the heavyweight opened-island host is untouched.
- Anchor each hover card to its node through the SAME seam `trackNode` subscription the opened island uses, scale-clamped by the shared `islandStyle`, so the transient card rides the camera with the node it describes.
- Render the card as INSPECT-ONLY: the wrapper carries `pointer-events: none` so the transient card never steals the pointer and flickers the hover off the node; the card's open affordance re-enables pointer events on itself (the one interactive escape).
- Key the mounted card on the target id so a hover moving between nodes remounts (a fresh bloom from the new glyph) rather than re-tweening across nodes.
- Mount the new host in the stage below the opened-island layer, so a card never paints over an opened interior.

## Outcome

The hover-bloom card now hosts as a lighter, second island variety: anchored through the same `trackNode`/`useNodeAnchor` mechanism, scale-clamped through the shared `islandStyle`, and inspect-only so it cannot contend for the pointer. It is a sibling layer, not a modification of the opened-island host, keeping the two LOD rungs structurally separate.

## Notes

The plan scoped this Step to the opened-island module, but the task and the cleaner factoring put the new host in its own sibling file that REUSES that module's exported `useNodeAnchor`/`islandStyle` helpers — additive, with the opened-island host unchanged. The only edit to the opened-island module's neighbors was adding `pointer-events: auto` to the card's open button so the affordance stays clickable inside the inspect-only wrapper.
