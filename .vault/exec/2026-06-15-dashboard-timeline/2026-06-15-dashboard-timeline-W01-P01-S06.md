---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add a unit test asserting self-consistency: the returned edge set contains only edges among the returned nodes

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Added the `returned_arcs_only_connect_returned_nodes_no_dangling_arc` unit test: an in-range edge between two kept nodes and an edge to an out-of-range node.
- Asserted the out-of-range node is excluded from the returned set, only the in-set edge survives, and every returned arc's src and dst are both in the returned node set.

## Outcome

Self-consistency is proven: no dangling arc to a dropped or out-of-range node ships. The kept node set drives the arc retain, which the test asserts directly so the invariant holds under both range exclusion and ceiling truncation.

## Notes

None.
