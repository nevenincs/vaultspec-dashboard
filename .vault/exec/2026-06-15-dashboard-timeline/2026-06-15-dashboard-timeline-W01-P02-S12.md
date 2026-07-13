---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

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
