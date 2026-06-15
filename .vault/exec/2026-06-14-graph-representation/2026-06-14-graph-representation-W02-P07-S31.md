---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S31'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Unit-test disparity filter, backbone selection, and bundling/un-bundling

## Scope

- `frontend/src/scene/field/backbone.test.ts`

## Description


## Outcome

Added `backbone.test.ts`: disparity thinning (backbone never thinned, leaf preserved, hub-to-hub noise dropped), backbone split, and bundling/un-bundle-on-hover geometry. 11 tests green.

## Notes

