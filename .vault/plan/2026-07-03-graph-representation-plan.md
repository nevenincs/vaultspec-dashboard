---
tags:
  - '#plan'
  - '#graph-representation'
date: '2026-07-03'
modified: '2026-07-03'
tier: L1
related:
  - '[[2026-07-03-graph-representation-adr]]'
  - '[[2026-06-14-graph-representation-research]]'
---
# `graph-representation` plan

- [x] `S01` - Delete set-meta-highlight end-to-end: command union member, controller forwarding, metaHighlightIds field state, emphasisSet branch, and clear-on-setData; `frontend/src/scene/sceneController.ts + frontend/src/scene/three/threeField.ts`.
- [x] `S02` - Make the recede continuous and eased: per-node dim targets (hover 0.3, durable spotlight/selection 0.5) tweened ~200ms in the render loop, node shader mix(vColor, uDimColor, vDim) replacing the binary threshold, glyph alpha eased on the same curve, prefers-reduced-motion snaps; `frontend/src/scene/three/threeField.ts`.
- [x] `S03` - Draw the cluster-selection perimeter fence: convex hull over the visible spotlight cohort plus Minkowski pad offset (rounded n-gon), accent-token stroke and low-alpha fill on the 2D overlay pass, visibility-mask gated, alpha ramped with the shared easing, fill skipped under perf degradation; `frontend/src/scene/three/threeField.ts`.
- [x] `S04` - Verify the grammar end-to-end: update scene tests (no set-meta-highlight references), run the scene vitest suites and the full frontend gate; `frontend/src/scene/ + just dev lint frontend`.

## Description

## Steps

## Parallelization

## Verification
