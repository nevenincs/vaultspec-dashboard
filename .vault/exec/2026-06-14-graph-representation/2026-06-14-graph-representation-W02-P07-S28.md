---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S28'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Compute the declared+structural layout backbone and feed only it to the layout

## Scope

- `frontend/src/scene/field/backbone.ts`

## Description


## Outcome

`applyModelToLayers` and `applyRepresentationMode` now feed ONLY `splitBackbone(edges).backbone` (declared+structural+meta) to the FA2 solver; the disparity-thinned temporal/semantic tiers render as context but are not layout input.

Added `backbone.ts`: `splitBackbone` separates the declared+structural+meta LAYOUT backbone (fed to FA2) from the disparity-thinned temporal/semantic CONTEXT (drawn but not laid out). Encodes the ADR's two-distinct-backbones rule. FA2-feed integration lands in the W03 fieldAssembly wiring.

## Notes

