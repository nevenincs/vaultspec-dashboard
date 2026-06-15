---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S15'
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
     The S15 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a route test asserting the tiers block rides the lineage error envelope and ## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a route test asserting the tiers block rides the lineage error envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Add `graph_lineage_unknown_scope_400s_with_the_tiers_block`: query an unknown scope and assert 400, an honest `error` string, and a present `tiers` block.
- Add `graph_lineage_inverted_range_and_bad_filter_400_with_the_tiers_block`: on a VALID scope, assert that an inverted `from > to` range and a malformed/unknown-facet filter each 400 with the tiers block; add a `percent_encode` test helper so the JSON filter is a valid URI component.

## Outcome

Two route tests prove the per-tier `tiers` block rides the lineage error envelope across all three client-error shapes (unknown scope, inverted range, bad filter).

## Notes

The first `urlencode`-based attempt for the JSON filter produced an `InvalidUriChar` because braces/quotes are not URI-safe; added a full RFC-3986 `percent_encode` helper for the filter value. The success/error envelope tests passed first try.
