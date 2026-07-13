---
tags:
  - '#plan'
  - '#scene-render-review'
date: '2026-07-02'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-02-scene-render-review-audit]]'
  - '[[2026-06-19-graph-backend-unification-adr]]'
---

# `scene-render-review` plan

### Phase `P01` - Interaction-thread and lifecycle hardening

Cache uiScale and hoist it out of the per-node pick loop, gate picking on pointer delta, cache overlay theme derivations, and close the destroy/remount atlas asymmetry.

- [x] `P01.S01` - SGR-004: hoist uiScale() out of pickNodeAtScreen's per-node loop and cache rootFontPx at module level, invalidated on resize + the UI-scale settings echo (labelStyle shares it); `frontend/src/scene/three/uiScale.ts + threeField.ts`.
- [x] `P01.S02` - SGR-005: gate picking on a >=1px pointer delta and hoist loop invariants (pairs with SGR-004); `defer the screen-space grid until a measured document-scale complaint; `frontend/src/scene/three/threeField.ts`.
- [x] `P01.S03` - SGR-006: cache the per-frame hex->CSS/labelStyle overlay derivations on the theme epoch (refresh-theme already invalidates); `frontend/src/scene/three/threeField.ts`.
- [x] `P01.S04` - SGR-007: close destroy()/remount atlas asymmetry via total-teardown (disposeGraph()+disposeGlyphs()) in destroy(); `frontend/src/scene/three/threeField.ts`.

## Description

## Steps

## Parallelization

## Verification
