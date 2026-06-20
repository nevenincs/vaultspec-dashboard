---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S13'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---




# mount the Cosmos graph surface as the Timeline main marks area

## Scope

- `frontend timeline surface`

## Description

- Mounted a local Cosmos graph surface in the Timeline chart region.

## Outcome

`Timeline` now creates a local dashboard scene for the bounded lineage slice and renders it in the main marks area, while keeping the timeline rail, month ticks, loading, empty, degraded, and minimap skeleton.

## Notes

Verified by frontend typecheck and focused tests; browser verification remains open.