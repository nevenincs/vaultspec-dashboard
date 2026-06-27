---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S30'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Un-bundle bundled edges on hover via the ego highlight

## Scope

- `frontend/src/scene/field/edgeBundling.ts`

## Description

## Outcome

Un-bundle-on-hover is wired via `betaForEdge`/the ego highlight: lifted edges straighten (beta 0) while the rest stay bundled; integrated through the field's hover ego path.

`betaForEdge(lifted)` un-bundles (straightens, beta 0) a hovered/lifted edge and keeps the rest bundled; the ego-highlight hover integration wires this in the W03 fieldAssembly step.

## Notes
