---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S04'
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
     The S04 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Bound the slice under the document node ceiling and emit an honest truncated block, serving declared, structural, and temporal tiers with semantic present-only and ## Scope

- `engine/crates/engine-query/src/lineage.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Bound the slice under the document node ceiling and emit an honest truncated block, serving declared, structural, and temporal tiers with semantic present-only

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Wrote the public `lineage` projection fn with the route-ready signature `(graph, scope, from, to, filter)`, validating the filter and id-sorting the collected nodes so the bound's kept page is deterministic.
- Bounded the slice under `MAX_DOCUMENT_NODES` (5000, the same document node ceiling the graph-query route enforces): an over-ceiling query truncates to the cap and emits an honest `LineageTruncated` block reporting the original total, the returned count, and a narrow-by-date-or-feature reason.
- Built the arc set from the post-cap kept node ids so truncation can never leave a dangling arc.
- Served the lineage tiers as declared/structural/temporal available and semantic present-only (excluded, with a reason), mirroring `envelope::asof_tiers_block` so the surface renders semantic as a designed inapplicable state in history, not a gap.

## Outcome

The projection is bounded and honest: capped node payload, self-consistent edges, and a present-only semantic tier. Verified by `slice_is_bounded_under_the_node_ceiling_with_an_honest_truncated_block` and `semantic_tier_is_present_only_declared_structural_temporal_serve`.

## Notes

The shipped document node ceiling constant in the graph-query route (`MAX_GRAPH_NODES = 5000`) is private to the API crate, which this phase must not touch. To reuse the ceiling value/concept rather than invent a new number, `MAX_DOCUMENT_NODES = 5000` is declared public in the engine-query lineage module, documented as the same document node ceiling. The W01.P02 route can adopt this public constant as the single source when it lands.
