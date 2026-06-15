---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Add a pure disparity-filter thinning of temporal/semantic edges to their significant subset

## Scope

- `frontend/src/scene/field/disparityFilter.ts`

## Description


## Outcome

Added `disparityFilter.ts`: the Serrano-2009 disparity filter thinning temporal/semantic edges to their statistically significant subset (alpha 0.3, OR rule, leaf-preserving); declared/structural are never thinned.

## Notes

