---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S05'
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
     The S05 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a unit test asserting the node-ceiling bound and the truncated block on an over-ceiling query and ## Scope

- `engine/crates/engine-query/src/lineage.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
