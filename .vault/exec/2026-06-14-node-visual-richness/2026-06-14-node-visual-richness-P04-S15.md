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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The build the hover-card DOM-island variety reusing the node anchor and island styling and ## Scope

- `frontend/src/app/islands/IslandLayer.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
