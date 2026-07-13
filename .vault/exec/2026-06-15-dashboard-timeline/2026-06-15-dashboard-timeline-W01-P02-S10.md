---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Build the lineage response through the shared envelope helper so the tiers block rides the success envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Build the lineage success response through the shared `super::envelope(data, tiers, None)` helper, with `data` carrying `nodes`, `arcs`, and `truncated` from the projection slice; no hand-built Json body.
- Source the success tiers from `super::degraded_tiers(&cell, ...)` so the semantic tier is reported excluded while the cell's real declared-tier status is overlaid truthfully per scope.

## Outcome

Every successful lineage response carries the per-tier `tiers` block via the shared envelope, honoring both the present-only-semantic ADR constraint and the truthful-declared rule.

## Notes

Chose `degraded_tiers` over `asof_tiers_block` because the latter adds a time-travel-specific structural degradation note that is wrong for a present-range lineage; `degraded_tiers` keeps structural fully available and overlays the real per-scope declared status.
