---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-06-15'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-gui-plan]]"
---

# Carry member_count through the scene seam and size feature nodes as constellation centers of gravity

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Carry `member_count` through the scene-mapping seam onto the sprite model.
- Size feature nodes by member count so a feature reads as a constellation
  center of gravity (more convergent documents → larger), per ADR D4.1.

## Outcome

Feature nodes render at a size proportional to their convergence; document
nodes are unaffected (no `member_count`).

## Notes

Sizing is a pure projection of `member_count`; absent the field (document
nodes) the sprite falls back to the default size.
