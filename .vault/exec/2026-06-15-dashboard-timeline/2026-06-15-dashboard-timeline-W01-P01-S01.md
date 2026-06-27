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
