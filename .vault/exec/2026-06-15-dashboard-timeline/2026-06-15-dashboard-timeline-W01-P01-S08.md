---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Register the lineage projection module in the engine-query crate root

## Scope

- `engine/crates/engine-query/src/lib.rs`

## Description

- Registered the new `lineage` module in the engine-query crate root (`lib.rs`), alongside the existing `pipeline` module that S01 extended.
- The public projection fn `lineage::lineage` and the payload types (`LineageSlice`, `LineageNode`, `LineageArc`, `LineageTruncated`, `LineageTiers`) and the `MAX_DOCUMENT_NODES` ceiling are exported through the module path for the W01.P02 route to consume.

## Outcome

The lineage projection and its types are reachable from the crate root. The crate builds and all 40 engine-query unit tests pass, plus the bridge integration test.

## Notes

The `pipeline` module was already registered; S08 added only the `lineage` module declaration. The `PipelineLanePhase` enum and `phase_for_doc_type` from S01 are re-exported transitively via the public `pipeline` module.
