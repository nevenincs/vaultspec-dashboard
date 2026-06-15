---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S42'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S42 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Retain and adapt the Playhead to the scroll-strip model and ## Scope

- `frontend/src/app/timeline/Playhead.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
