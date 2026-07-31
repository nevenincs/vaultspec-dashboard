---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:e8637749694fefb2b6ec148a47e546f5af3cd064dbb8cd44a43b88179d20655a'
step_id: 'S15'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add salience as a label-priority input to the DOI label-culling pass

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

## Outcome

Added `labelPriority` (salience primary, member-count tie-break) as the DOI label-priority input; the helper is delivered and tested, integrated into the visible cull at W04.P11 (node-canvas amendment).

## Notes
