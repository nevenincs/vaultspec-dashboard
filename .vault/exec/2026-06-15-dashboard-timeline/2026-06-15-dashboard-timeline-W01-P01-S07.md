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
