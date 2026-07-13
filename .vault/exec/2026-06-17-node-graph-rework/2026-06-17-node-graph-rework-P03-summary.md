---
tags:
  - '#exec'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - "[[2026-06-17-node-graph-rework-plan]]"
---

# `node-graph-rework` `P03` summary

Tier 3 (edge semantics and rendering) is complete and verified live. Steps
`P03.S15`-`P03.S19` are closed.

- Modified: `cosmosField.ts`
- Commit: `dc0225e`

## Description

Edges now carry meaning. Per-link colour encodes the tier (declared / structural /
temporal / semantic, read live from the `--color-tier-*` design tokens so it tracks
the active theme), width and opacity encode confidence, and broken/stale state dims
the link; an unknown tier falls back to the scene rule colour, dimmed, never silently
re-bucketed. These are set via `setLinkColors` / `setLinkWidths`. A low base opacity
keeps the dense mesh a subtle haze so the nodes stay readable; `linkGreyoutOpacity`
0.04 plus a widened `linkVisibilityDistanceRange` (the [50,150]px default faded most
edges out at our scales) make a hovered/selected node's incident edges read clearly
and stop edges vanishing on zoom.

Hidden-edge honesty: cross-boundary edges (an endpoint absent from the current slice)
are dropped and COUNTED, surfaced via `debugSnapshot().droppedEdges`, never silently
lost. Verified live at 2564 dropped, matching the app's "edges hidden" chip exactly.

Live verification: the disc renders a visible tier-coloured edge mesh (connected
structure where Tier 1/2 showed bare dots); zero console errors. Note the spatial
arrangement of edges is still a uniform crisscross because the placement is the static
phyllotaxis disc - connected nodes are pulled together only by the live force layout
in Tier 4, so Tier 3 delivers the edge ENCODING while Tier 4 delivers the edge
STRUCTURE.

Divergence recorded (ADR D4): re-introducing tier colour on the canvas is a deliberate
departure from the binding Figma redesign, which had retired canvas edges to flat grey
`--color-scene-rule` (the tier data survived for filtering but not colour). The user's
explicit Tier-3 requirement that edges encode meaning governs here; flagged for review.
