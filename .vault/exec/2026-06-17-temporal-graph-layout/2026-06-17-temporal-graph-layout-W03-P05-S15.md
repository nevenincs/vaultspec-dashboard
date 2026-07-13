---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
step_id: 'S15'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# keep minimap, range, scroll, zoom, and playhead controls driving the temporal graph range

## Scope

- `frontend timeline controls`

## Description

- Kept existing scroll, minimap, range, zoom, and playhead state as temporal graph inputs.

## Outcome

The temporal scene adapter derives x coordinates from the same scroll-strip `pxPerMs`, `scrollOffset`, visible range, and chart height that the existing timeline controls own.

## Notes

Verified by adapter tests and typecheck.
