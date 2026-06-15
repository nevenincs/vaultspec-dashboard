---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S55'
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
     The S55 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the range-select chip with play-the-range to the control bar and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the range-select chip with play-the-range to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the range-select chip rendering the committed date range as a clearable, tabular chip in the control bar.
- Wire the clear action to empty the date range through the single date-range writer and return the playhead toward LIVE.
- Reuse the existing range-player (the play trigger plus the mounted RAF driver hook) so the chip's play button animates the playhead across the committed band.

## Outcome

The range chip appears only when a range is committed, with tabular bounds, a play trigger, and a clear that empties the range and returns toward LIVE. Verified by a component test that seeds a committed range, asserts the play control renders, clears it, and asserts the date range empties.

## Notes

The chip writes the date range ONLY through the shared single date-range writer, preserving the single-date-range-writer invariant; the play behavior reuses the retained range-player from the existing range-select so reduced-motion and the RAF loop discipline come for free.
