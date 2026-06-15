---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S25'
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
     The S25 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Extend useTimelineStore with scroll offset and pixels-per-time scale view state and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
