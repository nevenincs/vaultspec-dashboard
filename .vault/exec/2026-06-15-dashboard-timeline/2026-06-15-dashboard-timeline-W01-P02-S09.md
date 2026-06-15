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
