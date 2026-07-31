---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:9f78e5b78f534d480777f6292669180bebdf7ee8d8aae0886e27a13d3ccde846'
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
