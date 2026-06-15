---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S01'
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
     The S01 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a deterministic doc-type to pipeline-phase mapping (research/reference to research, adr to adr, plan to plan, exec to exec, audit to review, rule to codify) and ## Scope

- `engine/crates/engine-query/src/pipeline.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a deterministic doc-type to pipeline-phase mapping (research/reference to research, adr to adr, plan to plan, exec to exec, audit to review, rule to codify)

## Scope

- `engine/crates/engine-query/src/pipeline.rs`

## Description

- Added a new `PipelineLanePhase` enum in `pipeline.rs` (Research, Adr, Plan, Exec, Review, Codify) serialized kebab-case, with an `as_str` accessor.
- Added the deterministic `phase_for_doc_type` mapping: research/reference to research, adr to adr, plan to plan, exec to exec, audit to review, rule to codify.
- Returned None for ambient and unknown doc-types: a commit has no phase lane (off by default, toggle-on per the ADR), and index or any unknown doc-type owns no lane, so the projection never invents a phase.

## Outcome

The doc-type to pipeline-lane mapping is in place as a pure, total function. It is distinct from the pre-existing status-derived `PipelinePhase` enum: this one is the static lane a document belongs to by kind alone, and it includes the codify lane the prior enum lacked. Covered by the S07 unit test; the lineage projection consumes it in S02.

## Notes

The plan and ADR named the mapping target as `pipeline.rs`, which already held a status-derived `PipelinePhase` used by the in-flight pipeline projection. To avoid changing that existing projection's semantics, the timeline lane mapping is an additive new enum and function in the same module rather than a mutation of the existing one.
