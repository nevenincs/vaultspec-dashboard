---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# preserve visible range and overscan as the sole temporal graph query boundary

## Scope

- `frontend timeline range state`

## Description

- Kept `Timeline` on the existing `visibleRange` plus lineage query boundary.

## Outcome

The temporal canvas consumes the same bounded `useTimelineLineage` response that the scroll-strip skeleton already requested. No new backend graph API or whole-corpus fetch was introduced.

## Notes

Verified by frontend typecheck and focused timeline adapter tests.
