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
