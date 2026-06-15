---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S37'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Render raw arcs under the client cap for v1

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add `resolveArcs`, which resolves each arc whose BOTH endpoints have a known
  position into a renderable arc (bowed path plus treatment plus label), dropping
  any arc with a missing endpoint so a dangling arc never draws.
- Add `rawArcs`, the v1 working path: resolve the in-range arcs then apply the
  belt-and-suspenders `MAX_TIMELINE_ARCS` cap reporting the dropped count.
- Wire the raw-arcs path into the timeline: build the endpoint lookup from only
  the virtualized, visible-lane marks so an arc resolves ONLY when both endpoints
  are on screen and their lanes are visible, then render each arc as an SVG path
  with its S36 treatment (stroke token via `var()`, dash, width, opacity, title).

## Outcome

Real lineage arcs draw between in-range marks under the client cap, styled by the
tier vocabulary; this is the v1 surface that bundling layers on top of.

## Notes

Endpoint visibility is enforced structurally by the position lookup (built from the
kept marks), so no separate in-range/visible-lane arc filter is needed.
