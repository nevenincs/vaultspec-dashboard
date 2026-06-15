---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S51'
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
     The S51 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the fit-all control and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the fit-all control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the fit-all control as a Lucide-iconed button.
- Add a pure `fitSpan` helper that computes the clamped scale and offset to fit a closed date span into the viewport with an inset margin, docking the span start at the left inset.
- Wire fit-all to the engine-enumerated corpus date bounds (a dumb projection of the wire extent), feeding them through `fitSpan` to the store.

## Outcome

Fit-all rescales and offsets the strip so the whole loaded corpus span frames in the viewport. Verified by a pure-helper test asserting the span start docks at the inset and the end stays in frame with the scale clamped, plus a component test asserting fit-all changes scale and docks a non-zero offset against the live corpus bounds.

## Notes

The corpus extent comes from the filters vocabulary date bounds, keeping the control a dumb consumer of the wire rather than computing the span from loaded nodes.
