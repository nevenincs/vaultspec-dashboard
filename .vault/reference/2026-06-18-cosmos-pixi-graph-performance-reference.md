---
tags:
  - '#reference'
  - '#cosmos-pixi-graph-performance'
date: '2026-06-18'
modified: '2026-06-18'
related: []
---

# `cosmos-pixi-graph-performance` reference: Cosmos hover and simulation hot paths

## Summary

The performance audit checked the application field wrapper in
`frontend/src/scene/field/cosmosField.ts`, the tuning adapter in
`frontend/src/scene/field/cosmosConfig.ts`, and the installed Cosmos bundle under
`frontend/node_modules/@cosmos.gl/graph/dist`.

Cosmos native point hover is a GPU-picking path that crosses back to the CPU. In
the bundle, `renderFrame()` calls `findHoveredItem()` while the mouse is on the
canvas; point hover draws a small hover FBO and then reads it through `regl.read()`,
which calls WebGL `readPixels`. Cosmos throttles that to roughly every fifth
rendered frame, but while the app keeps the Cosmos frame loop awake for hover, the
readback still creates a recurring GPU pipeline stall.

Cosmos link hover is gated separately by link-hover callbacks. The app did not set
link hover callbacks, so the critical stall was the point-hover path configured
through `onPointMouseOver` and `onPointMouseOut`.

The many-body force cost came from the default non-classic quadtree branch.
Cosmos defaults `useClassicQuadtree` to false and instantiates the non-classic
force path. That branch derives its depth from `Math.log2(adjustedSpaceSize)` and
runs every generated level. The `simulationRepulsionQuadtreeLevels` option is only
consulted by the classic branch's shader generator, and even there the bundle still
allocates level FBOs up to the adjusted space size. Therefore the app setting
`simulationRepulsionQuadtreeLevels: 8` was not a valid fix for the default hot
path.

The implementation now treats Cosmos as a WebGL point/link renderer for uploaded,
deterministic positions. The app disables Cosmos GPU simulation, disables native
Cosmos hover picking, removes command paths that used `getPointPositions()` or
`zoomToPointByIndex()`, and performs bounded pointer picking from the uploaded
position mirror. Selection and hover emphasis still upload membership to Cosmos'
greyout mechanism, but no runtime hover interaction requires a GPU readback.

The delta path must preserve the same graph invariants as `SceneGraphModel`: when
a node is removed, all incident edges must be removed from the held edge set before
the next upload. Edge ids are also part of the upload signature because
`linkEdgeIds` drives visibility masking; two edges with the same endpoints but
different ids cannot share one signature.
