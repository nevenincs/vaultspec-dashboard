---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S43'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Retain and adapt the RangeSelect as the single date-range writer over the scroll-strip model

## Scope

- `frontend/src/app/timeline/RangeSelect.tsx`

## Description

- Re-shape `rangeFromDrag(x1, x2, pxPerMs, scrollOffset)` to map each viewport x
  to its instant through the scroll-strip `xToTime` over the shared scale and
  offset (canonical epoch origin), then order the pair.
- Position the committed band through the scroll-strip `timeToX` over the same
  scale and offset, dropping the old window-form mapping.
- Read `pxPerMs`/`scrollOffset` from the timeline store in `RangeSelect`; remove
  the now-unneeded width state and its ResizeObserver (band geometry comes from
  the strip helpers).
- Keep shift-drag as the range gesture, plain drag reserved for the playhead, and
  keep `setDateRange` as the SINGLE date-range writer.
- Retain `useRangePlayer` driving the playhead across the band on animation frames
  only while a play is active (idle = no per-frame callback) and the reduced-motion
  instant-jump floor.
- Update `RangeSelect.test.ts` to the new `rangeFromDrag` signature, asserting the
  ordered range and that it tracks the scroll offset.

## Outcome

Shift-drag range selection maps onto the scroll-strip coordinate model and remains
the single writer of the date-range filter. Play-the-range and the reduced-motion
floor are intact. Gate green scoped to the file (eslint, prettier, tsc, vitest).

## Notes

None.
