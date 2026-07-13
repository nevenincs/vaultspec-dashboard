---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add a unit test asserting the node-ceiling bound and the truncated block on an over-ceiling query

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Added the `slice_is_bounded_under_the_node_ceiling_with_an_honest_truncated_block` unit test: builds an over-ceiling graph (`MAX_DOCUMENT_NODES + 250` in-range plan nodes) and asserts the returned node payload is hard-capped at the ceiling.
- Asserted the truncated block reports the honest original total, the returned count equal to the ceiling, and a non-empty reason.
- Asserted a small slice under the ceiling carries no truncation block.

## Outcome

The node-ceiling bound and the honest truncated block are proven on an over-ceiling query and absent on an under-ceiling query. Expected values are derived from the specification (the ceiling and the constructed total), not copied from a run.

## Notes

None.
