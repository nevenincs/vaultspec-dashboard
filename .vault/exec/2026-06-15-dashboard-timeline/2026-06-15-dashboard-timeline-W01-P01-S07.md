---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S07'
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
     The S07 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a unit test asserting the doc-type to phase-lane mapping for each pipeline phase and ## Scope

- `engine/crates/engine-query/src/pipeline.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a unit test asserting the doc-type to phase-lane mapping for each pipeline phase

## Scope

- `engine/crates/engine-query/src/pipeline.rs`

## Description

- Added the `doc_type_maps_to_its_single_pipeline_lane_for_each_phase` unit test in `pipeline.rs`.
- Asserted each phase mapping: research and reference to research, adr to adr, plan to plan, exec to exec, audit to review, rule to codify.
- Asserted commit, index, an unknown doc-type, and the empty string map to None (no invented phase), and that the lane serializes to its kebab-case wire token.

## Outcome

The deterministic doc-type to phase-lane mapping is proven for every pipeline phase and for the no-lane cases. Expected values are derived from the ADR mapping specification.

## Notes

None.
