---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S26'
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
     The S26 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Extend useTimelineStore with per-lane visibility view state and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Extend useTimelineStore with per-lane visibility view state

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Extend `useTimelineStore` with per-lane visibility view state: a `laneVisibility` map keyed by the six phase lanes plus a `toggleLane(lane, visible?)` action.
- Export `PHASE_LANES` (the `research|adr|plan|exec|review|codify` lanes) and a `PhaseLane` type as the single source the visibility map and the W03 renderer key off.
- Default every lane visible; `toggleLane` flips a lane or sets it idempotently when `visible` is given.

## Outcome

The store carries the lane-visibility state the W04 control bar's lane toggles drive and W03 renders only the visible lanes from. The lane set mirrors the lineage wire's `LineagePhase` lanes.

## Notes

None.
