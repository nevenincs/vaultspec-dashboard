---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:db154040aaf6145aaf0f2c41821902b754703532e0f4798cce88dfafe0b97904'
step_id: 'S41'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add BubbleSets hull geometry at document LOD

## Scope

- `frontend/src/scene/field/bubbleSets.ts`

## Description

## Outcome

Added `bubbleSets.ts`: `featureHulls` = padded convex hull (Andrew monotone chain) per feature, degenerate bubble for <3 members; the cheap deterministic BubbleSets approximation.

## Notes
