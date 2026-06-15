---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S49'
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
     The S49 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the feature filter to the control bar and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the feature filter to the control bar

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the feature filter chip group, sourcing its vocabulary from the engine feature-tag enumeration through the shared filters-vocabulary hook.
- Write chosen feature tags into the shared filter store's feature-tags facet so the surface collapses the arcs to that feature's lineage thread.

## Outcome

Feature chips render the live feature-tag enumeration; toggling writes the filter store's feature tags. Verified by a component test driven through the real mock-engine transport that finds an enumerated feature chip and asserts the store write.

## Notes

The feature-tag list is capped to the leading entries for the bar, matching the stage `FilterBar` slice so a large corpus does not flood the control surface.
