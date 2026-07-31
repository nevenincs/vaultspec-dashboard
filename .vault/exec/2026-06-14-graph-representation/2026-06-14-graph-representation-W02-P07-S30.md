---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:577b90e7ccb6e3a49b5d62e8843351a5b94ae3a856cf3e1d127e518029e6873b'
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
