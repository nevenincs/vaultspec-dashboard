---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S25'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Extend useTimelineStore with scroll offset and pixels-per-time scale view state

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Extend `useTimelineStore` with scroll-strip view state: a `scrollOffset` (CSS px from the strip origin) and a `pxPerMs` pixels-per-time scale, with `setScrollOffset`/`setPxPerMs` setters.
- Add a `DEFAULT_PX_PER_MS` default density (~1.5 days per 100px) so a multi-month corpus opens scrollable.
- Guard the setters: clamp offset to non-negative and reject a non-positive scale (which would collapse the strip).

## Outcome

The store carries the scroll-strip primitives W03's scroll-strip model consumes. Existing `window`/`playheadT` fields are kept intact for W03 to adapt.

## Notes

The hard zoom-band clamp lives in W03's scroll-strip helper; the setter guard is just the floor against a degenerate scale.
