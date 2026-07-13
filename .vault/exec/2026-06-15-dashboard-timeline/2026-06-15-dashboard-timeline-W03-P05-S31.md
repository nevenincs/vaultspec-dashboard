---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S31'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add unit tests for the scroll-strip scale, offset, virtualization, and cap helpers

## Scope

- `frontend/src/app/timeline/scrollStrip.test.ts`

## Description

- Add co-located vitest unit tests for the scroll-strip model.
- Assert the scale time-to-x round-trip, the zoom-band clamp (including the collapsed and non-finite guards), and the viewport-x mapping at multiple scroll offsets.
- Assert live-edge docking: `now` lands exactly at the right viewport edge, and a smaller offset walks the right edge back in time.
- Assert zoom-anchor invariance (the instant under the cursor is preserved across zoom in and out, and at the clamped scale).
- Assert `visibleRange` padding and offset-tracking, `isInVisibleRange` boundary inclusivity, and the cap (under-cap passthrough, over-cap truncation with dropped count, drop-everything on a degenerate max).

## Outcome

The scroll-strip scale, offset, live-edge docking, zoom invariance, virtualization, and cap are proven by 15 passing unit tests. All `src/app/timeline` suites are green (56 tests across 9 files), including the prior `Timeline.test.ts` unaffected by the lane re-export.

## Notes

One initial test expectation was corrected to the spec: `clampPxPerMs(Infinity)` falls to the safe `MIN_PX_PER_MS` floor (non-finite is a collapsed scale), not the max ceiling.
