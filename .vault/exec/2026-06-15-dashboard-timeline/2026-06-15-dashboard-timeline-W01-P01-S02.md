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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Collect the dated document nodes in the requested range with blob-true creation dates from the git object DB and ## Scope

- `engine/crates/engine-query/src/lineage.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
