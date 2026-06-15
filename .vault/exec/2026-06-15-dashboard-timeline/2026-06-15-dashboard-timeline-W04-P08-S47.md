---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S47'
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
     The S47 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add relation/derivation filter chips sourced from the engine filters enumeration and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add relation/derivation filter chips sourced from the engine filters enumeration

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the relation/derivation filter chip group, reusing the stage facet-chip pattern (`aria-pressed`, token styling).
- Source the chip vocabulary from the engine filters enumeration through the shared filters-vocabulary hook; never a hardcoded relation list.
- Write the chip choices into the shared filter store's relations facet so the rendered arc kinds follow the engine vocabulary.

## Outcome

Relation chips render the live filters relation enumeration; toggling a chip writes the filter store. Verified by a component test driven through the real mock-engine transport that finds an enumerated relation chip and asserts the store write, proving the vocabulary comes from the wire, not a literal.

## Notes

The chip group is a small shared local component mirroring the stage facet-chip shape, reused for both relation and feature filters so the two bars read alike.
