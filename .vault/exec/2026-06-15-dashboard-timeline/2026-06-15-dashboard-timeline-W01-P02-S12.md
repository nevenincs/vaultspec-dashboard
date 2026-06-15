---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S12'
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
     The S12 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Register the lineage route in the routes module and ## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Register the lineage route in the routes module

## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs`

## Description

- Register the route as `GET /graph/lineage` in the router builder, wired to `routes::temporal::graph_lineage`, placed with the temporal/graph family next to `/graph/asof` and `/graph/diff`.
- Add `/graph/lineage` to the `CONTRACT_ROUTES` inventory so the implementation and the contract drift loudly rather than silently.

## Outcome

The lineage projection is reachable on the wire at `GET /graph/lineage` and recorded in the route inventory; the existing `pub mod temporal` declaration in the routes module needed no change.

## Notes

Chose `GET /graph/lineage` over an `/events` extension: it sits with the temporal/graph family, keeps the timeline a single-selector consumer of one bounded projection, and reads as a GET range query consistent with `/graph/asof` and `/graph/diff`. The route file itself uses the existing shared `super::envelope`/`super::api_error`/`super::degraded_tiers` from `routes/mod.rs`, so no new wiring was added there.
