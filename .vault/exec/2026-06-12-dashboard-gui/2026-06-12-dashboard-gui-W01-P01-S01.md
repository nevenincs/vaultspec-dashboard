---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S01'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# replace per-frame edge re-tessellation with mesh-based edge rendering in the spike harness per the G6.b spike finding

## Scope

- `frontend/spike`

## Description

- Add `frontend/spike/edgeMesh.ts`: build one static line-list mesh per
  provenance tier (`MeshGeometry` topology `line-list`, shared white texel,
  per-mesh tint/alpha for the four tier treatments); positions live in a
  preallocated buffer re-uploaded in place per frame.
- Export pure helpers `partitionEdgesByTier` and `writeSegmentPositions` so
  the endpoint partitioning and buffer-write logic are unit-testable without
  a GPU context.
- Rewire `frontend/spike/main.ts`: drop the per-frame `Graphics`
  re-tessellation, fill a shared node-position array during the existing
  sprite sync pass, and call the edge field's single update (one typed-array
  write pass plus one buffer upload per tier, no per-frame allocation).
- Add `frontend/spike/edgeMesh.test.ts` covering tier partitioning, tier
  wrap, unknown-id skip, and segment position writes.

## Outcome

Per-frame edge cost in the spike is now a position-buffer re-upload instead
of CPU stroke tessellation — the exact mitigation the foundation audit named
for the failed 10k/50k dynamic phases. Measurement phase keys
(`layout-running`, `settled-rebuild`, `settled-static`) are kept from the
foundation run so S02 numbers compare directly. Quality gates green:
typecheck, eslint, vitest (14 passed, 4 files), prettier.

## Notes

Frame-time measurement against the G6.b gate criteria is S02's job; this
step lands the rendering change only. The line width is the GL line-list
minimum (1px device pixel) versus the prior 0.5px stroke — visually
acceptable for the spike, irrelevant to the gate (the production field gets
its own tier treatments in W01.P03).

