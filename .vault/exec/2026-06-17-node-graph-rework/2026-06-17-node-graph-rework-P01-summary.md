---
tags:
  - '#exec'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-node-graph-rework-plan]]"
---

# `node-graph-rework` `P01` summary

Tier 1 (basics) is complete and verified live. All eight steps `P01.S01`-`P01.S08`
are closed. The headline canvas now runs `@cosmos.gl/graph` as a PURE renderer and
shows the real vault on a free, centred canvas inside a configurable, default-circular
bound.

- Modified: `cosmosField.ts`, `sceneController.ts`, `viewStore.ts`, `GraphControls.tsx`
- Commits: `07d49af` (renderer-only + bound + disc placement), `8d1ca68` (bound control)

## Description

`CosmosField` was switched to renderer-only - `enableSimulation: false` and
`rescalePositions: false`, no `graph.start()` - which removes both confinement
mechanisms verified in the cosmos source: the per-tick `clamp(pos, 0, spaceSize)`
(sim-gated, the "rectangle") and the upload-time rescale that squeezes content into a
corner when the sim is off (the "corner cluster"). Positions are produced externally
by a centred phyllotaxis placement that is non-overlapping by construction and pushed
with `setPointPositions(flat, dontRescale) + render()`.

A configurable containment was added (ADR D3): `free`, `circle` (default), or `rect`
with a settable size (0 = auto-fit). It is the additive `set-bounds` scene-seam command
(retained on the controller via `getBoundsState`), held in the view store as a viewer
preference (not reset on scope swap), and driven from a kit `SegmentedToggle` + size
slider in the Graph-settings popover.

Live verification (the user is ground truth; read via the dev globals, non-tautological):
the field renders 3169 real nodes (= 975 `doc:` vault documents + 1708 `plan:` structure
+ 453 `code:` + 33 `rule:`, 0 duplicates - grounded against `vaultspec-core vault stats`
= 975 documents) as a disc centred exactly on the space centre (centroid 4096,4096), a
near-square bbox (~2207 x 2212), no rectangle, no corner cluster, no overlap, zero
console errors. Switching the bound re-lays the field correctly: rect grid (1932 x 1898),
free spread (3493), circle size 1500 -> diameter ~2986; default circle restored.

Note: the SDF crisp-node layer the ADR referenced (`crispNodeLayer.ts`) was reverted out
of the tree by its owning agent before execution, so Tier 1 renders via cosmos's own
point bodies (`scalePointsOnZoom`); it composes with the SDF layer if that returns.
Two pre-existing TypeScript errors in peer test files (`sceneMapping.test.ts`,
`searchController.test.ts`) are unrelated to this work and are flagged for the review gate.
