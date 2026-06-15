---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S39'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Un-bundle the hovered node's arcs as the bundling-legibility affordance

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add `incidentArcIds`, the pure set of arcs touching a node (src or dst) — the
  hovered node's incident arcs.
- Add `bundledWithHoverUnbundle`: when bundling is active and a node is hovered,
  resolve the hovered node's incident arcs RAW (full, un-bundled) and bundle the
  rest, drawing the raw incident arcs over the bundle so the hovered ego is always
  traceable through it; at rest (no hover) the result is exactly the bundled set.
- Wire the affordance into the timeline by reading the store `hoveredNodeId` and
  passing it to the bundling path, so hovering un-bundles the ego while the rest
  stay bundled.

## Outcome

A user can always trace one node's true lineage through a bundle by hovering it;
the affordance adds nothing at rest, preserving the clean bundled read.

## Notes

The combined raw-plus-bundled union is capped so the un-bundling can never exceed
the arc ceiling.
