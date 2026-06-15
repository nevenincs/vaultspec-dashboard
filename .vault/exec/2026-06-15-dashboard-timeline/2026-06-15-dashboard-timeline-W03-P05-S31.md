---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S31'
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
     The S31 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add unit tests for the scroll-strip scale, offset, virtualization, and cap helpers and ## Scope

- `frontend/src/app/timeline/scrollStrip.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
