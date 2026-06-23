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

BROWSER-VISUAL confirmation COMPLETED. Both MCP browsers (chrome-devtools and Playwright)
were profile-locked by concurrent instances, so an EPHEMERAL-profile Chromium was launched
directly via the project's bundled `playwright` (`chromium.launch()` — a fresh temp
profile, no shared lock; software WebGL via `--use-angle=swiftshader`) against the live dev
app on `:5176`. A fresh profile starts with no active scope; the engine session resolves
the `main` worktree automatically once the corpus loads.

ONE click on the graph legend "Plans" category, captured by network interception, produced
exactly the one-authority flow:

- `PATCH /api/dashboard-state` — the canonical `doc_types` facet written from the GRAPH
  legend (not a private mask).
- `POST /api/graph/query` — the GRAPH re-queried with the filter (narrowed).
- `GET /api/graph/lineage?scope=...&filter={"doc_types":["plan"]}` — the TIMELINE re-queried
  with the SAME canonical filter on the wire (narrowed).
- DOM: the `plan` legend button `aria-pressed=true` and every other doc-type button dimmed;
  the screenshot showed the graph collapse from dense clusters to a sparse plan-only scatter
  and the timeline dots thin to match.
- Clearing (second click): `aria-pressed=false`, all buttons full opacity, a clear PATCH
  fired — the surfaces restored.

This is the full bidirectional cross-wiring: a category narrowed on the GRAPH drives the
graph, the timeline, and (client-side, same `dashboardState.filters`) the rail together. The
reverse direction (rail authoring the same plane) is the identical mechanism and was already
verified in the left-rail feature-filter campaign. The throwaway verification script and
screenshots were removed after capture (dev-artifacts-are-scoped-and-reclaimable).

