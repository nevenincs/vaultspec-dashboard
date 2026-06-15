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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S43 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Retain and adapt the RangeSelect as the single date-range writer over the scroll-strip model and ## Scope

- `frontend/src/app/timeline/RangeSelect.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
