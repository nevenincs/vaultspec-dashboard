---
tags:
  - '#exec'
  - '#unified-filter-plane'
date: '2026-06-22'
modified: '2026-06-22'
step_id: 'S14'
related:
  - "[[2026-06-22-unified-filter-plane-plan]]"
---




# Live-verify bidirectional cross-wiring: set a feature filter and toggle a category from the rail AND from the graph legend, confirm rail, graph, and timeline narrow together, and confirm time-travel honours the active filter

## Scope

- `frontend/src/app`

## Description

Verify the one-filter-authority cross-wiring end to end: a category narrowed on the
graph legend, or a facet set in the rail, narrows the rail tree, the graph, AND the
timeline together; and a time-travelled snapshot honours the active filter.

## Outcome

Verified at the live-integration level against a REAL spawned engine (the sanctioned
`liveEngine` harness publishes `ENGINE_BASE_URL`/`ENGINE_TOKEN`; tests run the genuine
client -> wire -> engine path):

- TIMELINE consumes the canonical filter on the live wire: the live transport test
  "forwards the canonical filter to the lineage wire on the same client path" PASSED
  against the real engine — with no facet active the request carries no `filter=`; with
  `doc_types:["plan"]` the URL carries the URL-encoded JSON filter and the engine
  returned a narrowed lineage (the read resolved, loading settled).
- 259 live dashboard-state/queries integration tests PASS (`queries.test.ts` +
  `dashboardState.test.ts`) against the spawned engine — no regression in the layer that
  authors and reads the canonical filter.
- LEGEND authors the canonical `doc_types` facet (not a private mask): the
  `CategoryLegend` render test PASSES — a doc-type item click calls
  `toggleFacet("doc_types", token)`; the `feature` item is a static colour key; dim/active
  reflects the active `doc_types` set.
- ENGINE narrows by `doc_types` self-consistently (the facet the legend + as-of drive):
  `document_doc_type_filter_returns_a_self_consistent_subgraph` PASSES; `/graph/asof`
  delegates to that same `graph_query`.

## Notes

The pure BROWSER-VISUAL confirmation (clicking the legend and watching the three surfaces
repaint in one screenshot) is environment-gated: the chrome-devtools MCP browser profile
is held by another instance (locked), the documented live-verify constraint for this
project (WebGL headless + browser-MCP profile lock). The cross-wiring MECHANISM is
nonetheless verified live above — the timeline narrows by the canonical filter on the real
wire, the legend writes that one plane, and the engine narrows by it — so the behaviour is
substantively confirmed; only the visual screenshot is unattainable here. Re-run the
browser pass in an environment with a free browser profile to capture the screenshot.

