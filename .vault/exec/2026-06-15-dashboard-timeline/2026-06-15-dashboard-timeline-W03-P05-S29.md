---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S29'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add visible-range virtualization with a margin so marks and arcs stay bounded at any corpus age

## Scope

- `frontend/src/app/timeline/scrollStrip.ts`

## Description

- Add `visibleRange(scrollOffset, viewportWidth, pxPerMs, marginPx, originMs)` returning the `[fromMs, toMs]` window to fetch and render, converting the viewport's left and right edges to time and padding each side by `marginPx`.
- Add an `isInVisibleRange(tMs, range)` predicate (inclusive of both bounds) for per-item virtualization.
- Express the range as a `VisibleRange` interface so consumers read named bounds.

## Outcome

Marks and arcs can be virtualized to the visible window plus a fixed pixel margin, so the read stays bounded at any corpus age (the range is the viewport span plus margin, never the whole corpus). The margin keeps items partly off-screen drawn while scrolling, avoiding pop-in.

## Notes

The range is derived purely from the scroll and scale inputs, so it tracks the scroll offset deterministically (a later offset yields a later range).
