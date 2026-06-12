---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S10'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# render node sprites with LOD discipline, silhouette and state colour far, full anatomy near, per G3.a and the ADR section 3.1 node anatomy

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Add `frontend/src/scene/field/nodeSprites.ts`: `NodeSpriteLayer`
  reconciling one batched sprite per node by stable id against the scene
  graph model, with per-frame position and visibility passes.
- Implement the §3.1 anatomy as pure, unit-tested helpers: `lodFor`
  (semantic-zoom threshold with focused-node override), `stateColor`
  (colour spent on state only; shape carries type), `freshnessAlpha`
  (30-day halo decay to a floor, invalid dates cool rather than error),
  `progressFraction` (clamped ring fraction, ringless without data), and
  `tierBadgeText` (per-tier degree marks, populated tiers only).
- Build full anatomy (progress ring, tier badges, DOI label) lazily per
  node, only at near LOD or for focused nodes - the far field draws
  silhouette + state colour only, per the LOD discipline.
- Take silhouettes from an injectable `GlyphTextureProvider` so the S16
  placeholder glyph set (and later the commissioned family per G7.c) swaps
  in without touching this layer.
- Add `frontend/src/scene/field/nodeSprites.test.ts` covering all pure
  helpers.

## Outcome

The field renders nodes under the anti-hairball LOD rule with the §3.1
anatomy channels separated (shape=type, colour=state, ring=progress,
halo=freshness, badges=per-tier degree). Gates green: typecheck, eslint,
vitest (47 passed), prettier.

## Notes

`SceneNodeData` gained an optional `title` field - the contract's §4 node
fields carry title and the §3.1 DOI label needs it; the RL-2 fold simply
missed it. Contract-aligning, optional, additive; flagged for
experience-architect at the P03 boundary alongside the S04 lock-time
additions. DOI label culling (density-aware) arrives with the camera work
in S12/S22; at this step labels render at near LOD only.

