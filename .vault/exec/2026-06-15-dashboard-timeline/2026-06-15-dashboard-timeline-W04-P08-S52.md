---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S52'
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
     The S52 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the fit-feature control and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the fit-feature control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the fit-feature control as a Lucide-iconed button, disabled until a feature filter is active.
- Compute the active feature's date span from the committed date range when one is set, falling back to the corpus bounds, and feed it through the shared `fitSpan` helper to the store.

## Outcome

Fit-feature is disabled with no feature filter and enables once a feature tag is chosen; activating it fits the feature's span. Verified by a component test asserting the disabled-then-enabled transition when a feature chip is toggled.

## Notes

The feature filter alone narrows which arcs draw, not the dates, so fit-feature derives its span from the committed range or corpus bounds rather than re-deriving member dates; a tighter per-feature date span is a natural follow-on once the lineage hook exposes feature extents.
