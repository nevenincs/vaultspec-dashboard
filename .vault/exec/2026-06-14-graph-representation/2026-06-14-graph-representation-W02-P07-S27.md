---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:e079f5f2e59f6cd0de85eb63cf11f3ce954b0a6ca9116392911dcf9272ab4c01'
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
