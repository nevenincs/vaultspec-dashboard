---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S09'
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
     The S09 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the lineage route handler taking scope, from, to, and filter params and calling the projection and ## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the lineage route handler taking scope, from, to, and filter params and calling the projection

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Add the `LineageParams` query struct mirroring `EventsParams`/`AsofParams`: `scope`, optional `from`/`to` (inclusive ISO date bounds), and an optional `filter` carried as a URL-encoded JSON object of the engine-owned wire filter.
- Add the `graph_lineage` async handler: resolve the per-request scope to its warm cell via `validate_scope` exactly as the sibling temporal handlers do, parse the optional filter, fail fast on an inverted range, and call `engine_query::lineage::lineage(&graph, &cell.scope, from, to, filter)` over the cell's live graph.

## Outcome

The lineage projection from W01.P01 is reachable through a handler that resolves scope, range, and filter identically to the events/asof family and calls into engine-query unchanged.

## Notes

The filter is parsed as URL-encoded JSON to match the contract §5 `&filter=` style and to exercise the real `Filter` type; the present-range lineage reads the cell's live graph and `cell.scope`, mirroring the graph-query present branch.
