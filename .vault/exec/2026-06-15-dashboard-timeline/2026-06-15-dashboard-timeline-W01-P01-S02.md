---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S02'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Collect the dated document nodes in the requested range with blob-true creation dates from the git object DB

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Created `lineage.rs` with the public `LineageNode`, `LineageArc`, `LineageSlice`, `LineageTruncated`, and tiers payload types serialized to match the events projection conventions.
- Added `created_in_range`, collecting dated document nodes whose blob-true frontmatter `created` date falls within an inclusive `[from, to]` range, comparing ISO yyyy-mm-dd strings lexically (the same discipline the filter date bounds use), with either bound optional.
- Read the date from the graph node's `dates.created` rather than re-deriving from the working tree, so the projection stays blob-true and read-and-infer.
- Excluded undated nodes (no timeline position) and nodes that own no pipeline lane.

## Outcome

The projection collects the in-range, in-scope, lane-owning document nodes, each carrying its stable id, doc-type, derived phase lane, blob-true dates, title, and total degree. Verified by the `collects_dated_nodes_in_range_with_their_phase_and_blob_true_date` and `open_bounds_are_inclusive_and_undated_nodes_are_excluded` tests.

## Notes

The plan row named the date source as the git object DB; in this engine the blob-true `created` date is already populated onto `Node.dates.created` by the index/asof ingest from the document frontmatter, so the projection reads that node field rather than re-walking git, keeping it a pure projection over the one model.
