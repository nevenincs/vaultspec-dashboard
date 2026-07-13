---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S42'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Retain and adapt the Playhead to the scroll-strip model

## Scope

- `frontend/src/app/timeline/Playhead.tsx`

## Description

- Replace the window-form coordinate math in `Playhead.tsx` with the scroll-strip
  helpers (`timeToX`/`xToTime`/`liveEdgeOffset`) over the shared store `pxPerMs`
  and `scrollOffset`, anchored on the canonical epoch origin.
- Add a `TIMELINE_ORIGIN_MS` constant to `scrollStrip.ts` (t=0 = Unix epoch) so
  the playhead, range band, and marks all share one strip origin.
- Re-shape the pure helpers: `dragToPlayhead(x, pxPerMs, scrollOffset, liveDockX,
  now)` snaps to LIVE within `LIVE_SNAP_PX` of the live dock (now's viewport x,
  which is the right edge), else maps x to its instant clamped to now;
  `keyboardStep(current, deltaMs, now)` drops the window argument and anchors at
  now.
- Compute the LIVE dock at the right viewport edge each drag from `timeToX(now,
  ...)`; LIVE renders at the right edge, a concrete instant maps through the strip.
- Derive the keyboard step/nudge from the visible span (`width / pxPerMs`) and the
  ARIA slider bounds from the scroll-strip viewport (`xToTime(0,...)` to now).
- Update `Playhead.test.ts` to the new helper signatures while keeping the
  `movePlayhead` time-travel-mode invariant assertions verbatim.

## Outcome

The playhead positions and scrubs against the scroll-strip model. LIVE docks at
the right edge via the live-dock computation; drag-to-scrub, the LIVE snap-back
zone, and the RECONNECTING degraded read are retained. `movePlayhead` remains the
single mutation writing both the timeline store and the shared `timelineMode`
(time-travel honesty intact). Gate green scoped to the file (eslint, prettier,
tsc, vitest).

## Notes

The retained `window`/`setPlayhead` store fields are left in place because the
concurrent context-menu resolver (`menus/eventMarkMenu`) still calls
`setWindow`; removing them is out of scope for this phase.
