---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S66'
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
     The S66 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Swap scrub, range-play, and bundle animation for instant state changes under prefers-reduced-motion and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Swap scrub, range-play, and bundle animation for instant state changes under prefers-reduced-motion

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Verified prefers-reduced-motion makes the surface behavioural animation instant: a reactive reduced-motion hook (subscribed to the media-query list, reading through the shared helper) drops the mark color/opacity transition utility so ego-highlight opacity is a cut not a tween; range-play swaps the animated sweep for an instant jump to the range end; bundling is a static path choice (no morph) by construction.

## Outcome

Under reduced motion the scrub/range-play/bundle changes are instant; reuses the project prefers-reduced-motion convention. Satisfied by the prior partial run; assessed and confirmed.

## Notes

Source satisfied by the prior partial run, reusing the established reduced-motion helper. This run confirmed the S66 render tests (reduced-motion drops the mark transition class; the motion-allowed control keeps it).
