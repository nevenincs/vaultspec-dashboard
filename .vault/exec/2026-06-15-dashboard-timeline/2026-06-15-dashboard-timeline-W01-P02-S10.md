---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S10'
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
     The S10 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Build the lineage response through the shared envelope helper so the tiers block rides the success envelope and ## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
