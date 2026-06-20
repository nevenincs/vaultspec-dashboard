---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
step_id: 'S18'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# surface truncation, degradation, and bucket density in the debug interface

## Scope

- `frontend temporal debug interface`

## Description

- Extend temporal scene data with viewport, density, and densest-bucket debug metadata.
- Add node and edge truncation accounting to the temporal scene adapter.
- Cap temporal canvas edges with the existing scroll-strip arc ceiling.
- Expand the timeline debug overlay with mode, static layout, nodes, edges, buckets, densest bucket, simulation, renderer lifecycle, dropped edges, truncation, and degradation state.

## Outcome

The temporal debug overlay now states what the canvas is fed and whether it is bounded, degraded, static, or dropping edges. The adapter no longer sends unbounded edge sets to Cosmos.

## Notes

Focused tests cover the debug text and the arc cap.
