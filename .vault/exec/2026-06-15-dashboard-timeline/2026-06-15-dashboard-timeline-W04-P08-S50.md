---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S50'
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
     The S50 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the zoom in/out control and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the zoom in/out control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add zoom-in and zoom-out controls as Lucide-iconed buttons.
- Apply the scroll-strip zoom helper anchored at the viewport centre so the centred instant is preserved, writing both the rescaled pixels-per-time and the new scroll offset back to the store; the scale stays clamped to the supported zoom band.
- Disable each control at its respective zoom-band limit.

## Outcome

Zoom in/out rescale the store's pixels-per-time within the band and adjust the offset to hold the centre. Verified by a component test asserting zoom-in raises the scale (capped at the max) and zoom-out lowers it.

## Notes

Zoom reuses the existing pure scroll-strip zoom helper rather than a control-local rescale, so the cursor/centre-anchoring invariant is the same one the surface already tests.
