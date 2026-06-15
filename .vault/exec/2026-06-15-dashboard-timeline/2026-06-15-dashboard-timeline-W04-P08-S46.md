---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S46'
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
     The S46 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the phase-lane show/hide toggles to the control bar and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the phase-lane show/hide toggles to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the `TimelineControls` control-bar component docked at the timeline top edge.
- Render one show/hide toggle per phase-lane entry, iterating the single lane source so the toggle vocabulary never duplicates the lane list.
- Drive lane visibility through the timeline store's per-lane toggle; the pressed toggle reads from store state with a non-color active cue (sunken fill plus strong rule, dashed border when hidden) and a shape-first lane label.

## Outcome

Six phase-lane toggles render with `aria-pressed` reflecting store visibility; clicking writes the store and the surface hides that lane. Verified by a component test that toggles the research lane and asserts both the store write and every lane having a toggle.

## Notes

The toggles are real focusable buttons keyed off the canonical lane list, so the control-bar lane vocabulary stays bound to the one phase-lane source rather than a local copy.
