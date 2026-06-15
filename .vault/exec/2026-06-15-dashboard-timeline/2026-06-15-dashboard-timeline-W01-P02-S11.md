---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S11'
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
     The S11 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Build the lineage error response through the shared envelope helper so the tiers block rides the error envelope and ## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the lineage error response through the shared envelope helper so the tiers block rides the error envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Route every lineage error through the shared error path so the tiers block rides the error envelope: `validate_scope` returns `super::api_error` for an unknown scope; a malformed filter, an inverted range, and a filter-validation error (unknown tier/relation/state) all return `super::api_error(&state, BAD_REQUEST, ...)`.
- Match the events handler's inverted-range fail-fast shape and the graph-query filter-error shaping.

## Outcome

Every lineage error path 400s through the shared envelope with the per-tier `tiers` block attached, so a client distinguishes a malformed request from a degraded backend.

## Notes

The projection's `FilterError` (unknown facet vocabulary) and a syntactic JSON parse failure are shaped separately but both ride `api_error`; no error path hand-builds a Json body.
