---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S34'
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
     The S34 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Render dated document marks with their Phosphor domain mark and tabular-numeral dates and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render dated document marks with their Phosphor domain mark and tabular-numeral dates

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Switch the timeline's primary data source from the events hook to the bounded
  lineage hook `useTimelineLineage`, reading nodes and arcs from the slice.
- Position each dated node at its blob-true `created` instant via the scroll-strip
  viewport mapping (store `pxPerMs`/`scrollOffset`, origin at the visible-range
  start) and in its lane via the phase-lane `laneOf`/`laneCenterY` geometry.
- Draw each node's Phosphor domain mark via the shared `DocTypeMark` chrome
  component in `currentColor`, shape-first, with the date label tabular.
- Respect per-lane visibility (hidden lanes neither rule nor place marks).
- Virtualize marks to the visible range plus a margin and apply the
  belt-and-suspenders `capItems(nodes, MAX_TIMELINE_MARKS)` ceiling.
- Retain the event-kind lane/mark/window helpers (LANES, laneOf, eventMark,
  timeToX window-form, zoomWindow) for the W03.P07 transport, and keep the
  context-menu side-effect import owned by the concurrent menus surface.

## Outcome

Lineage nodes render as dated, lane-placed, focusable Phosphor marks; the surface
is bounded by virtualization plus the mark cap and reads no raw `tiers` block.

## Notes

The default store `scrollOffset` opens the strip at the epoch origin; docking LIVE
at the right edge is wired by the W03.P07 playhead/scroll adaptation, not here.
A concurrent agent added an event-mark context menu; its resolver module and the
retained `setWindow`/window helpers were preserved so it keeps compiling.
