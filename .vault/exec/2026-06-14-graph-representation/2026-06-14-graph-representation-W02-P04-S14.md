---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add salience-driven nodeRadius helper superseding member-count for non-feature species

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

## Outcome

`nodeRadius` now drives size from `salience` for every species (band 1.0x..2.6x base), superseding the member-count rule; member-count is the honest fallback only when salience is absent.

## Notes
