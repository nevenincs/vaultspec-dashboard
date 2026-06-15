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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a unit test asserting self-consistency: the returned edge set contains only edges among the returned nodes and ## Scope

- `engine/crates/engine-query/src/lineage.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
