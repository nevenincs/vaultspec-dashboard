---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:cc7d2042a4ee1671e95d1bd3eed106f97a9dd6b482da2ba47c439777b0269bd1'
step_id: 'S10'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# teach the representation dispatcher to upload temporal seed positions to the Cosmos field

## Scope

- `frontend scene representation layout`

## Description

- Taught the Cosmos field to execute representation-mode layouts.

## Outcome

`CosmosField` now stores current scene data, applies `representationLayout`, uploads seed positions, and emits representation-mode change events. Temporal mode consumes the lineage seed positions.

## Notes

Verified by frontend typecheck and representation-layout tests.
