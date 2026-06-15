---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S46'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Land the salience-size and label-priority code and verify member-count folds into feature salience

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description


## Outcome

Landed the code: `nodeRadius` is salience-driven (member-count fallback only when salience absent); the sprite `refresh` cull shows ambient labels by `labelPriority` against `ambientLabelFloor` (focused/lifted always label). Verified member-count folds into feature salience via the fallback.

## Notes

