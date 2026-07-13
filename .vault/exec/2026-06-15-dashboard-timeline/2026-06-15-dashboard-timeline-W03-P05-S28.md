---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S28'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the scroll-strip scale and offset model (pixels-per-time, LIVE-docked-right, scroll-left-walks-back) as a pure helper

## Scope

- `frontend/src/app/timeline/scrollStrip.ts`

## Description

- Add the scroll-strip model as a pure, deterministic helper module: a `pxPerMs` pixels-per-time scale and a `scrollOffset` (CSS px from a fixed strip origin) define the time-to-x mapping.
- Provide `timeToStripX`/`stripXToTime` (scroll-independent strip coordinates) and `timeToX`/`xToTime` (viewport coordinates, subtracting the scroll offset), each an exact inverse.
- Add `liveEdgeOffset(nowMs, viewportWidth, pxPerMs, originMs)` so LIVE docks at the RIGHT viewport edge and a smaller offset scrolls left/back in time.
- Add `zoomAt` rescaling `pxPerMs` by a factor while pinning the instant under the cursor x (the scroll-model analogue of `zoomWindow`), and `clampPxPerMs` with `MIN_PX_PER_MS`/`MAX_PX_PER_MS` zoom-band clamps.
- Keep every helper free of `Date.now`/DOM: `now` is always passed in.

## Outcome

The scroll-strip scale and offset model is in place as pure functions W03.P06 positions marks and arcs against. LIVE-docked-right and scroll-left-walks-back are exact properties of `liveEdgeOffset` and the viewport mapping; zoom-anchor invariance holds at the clamped scale.

## Notes

A non-finite or non-positive scale collapses the strip, so `clampPxPerMs` falls back to the safe `MIN_PX_PER_MS` floor (including `Infinity`) rather than the max ceiling.
