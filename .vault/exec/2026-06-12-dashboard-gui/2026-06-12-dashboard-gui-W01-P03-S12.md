---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S12'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement camera pan and zoom with semantic-zoom thresholds and pointer hit-testing emitting hover, select, open events per G3.b

## Scope

- `frontend/src/scene/field/camera.ts`

## Description

- Add `frontend/src/scene/field/camera.ts` with four cooperating pieces,
  the math and gesture logic pure and unit-tested:
- `Camera`: world-transform owner with cursor-anchored zoom (the world
  point under the cursor stays stationary - verified by test), clamped
  scale band, and a change subscription that drives anchors, LOD, and label
  culling.
- `semanticLevel`: geometric scale mapped onto the three discrete levels
  (constellation, feature, document) per the semantic-zoom literature the
  ADR cites - the level, not the raw scale, is what gates unfolding.
- `SpatialHitTester`: grid-hashed nearest-node lookup (batched sprites
  carry no per-sprite interaction), correct across cell borders.
- `PointerGestures`: DOM-free click-vs-drag state machine - drag pans and
  suppresses the click, click emits `select` (hit or clearing null), plain
  moves emit `hover` only on transitions, double-click emits `open` over a
  node only. Events are the locked seam shapes.
- Add `frontend/src/scene/field/camera.test.ts` covering anchored zoom,
  coordinate round-trips, clamping, level mapping, spatial hits, and all
  four gesture behaviours.

## Outcome

The stage's input model per G3.b exists with its semantics tested
DOM-free; canvas wiring (pointer listeners onto the Pixi canvas) is part of
the field assembly in S21's stage mount. Gates green: typecheck, eslint,
vitest (63 passed), prettier.

## Notes

Semantic-zoom thresholds (0.6, 1.6) are interim constants without
hysteresis; if level flapping shows up in real interaction, add a hysteresis
band - the discrete-level surface already isolates consumers from that
change.

