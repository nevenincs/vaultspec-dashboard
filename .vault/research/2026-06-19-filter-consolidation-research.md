---
tags:
  - '#research'
  - '#filter-consolidation'
date: '2026-06-19'
modified: '2026-06-19'
related:
  - '[[2026-06-19-filter-controls-research]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
---

# `filter-consolidation` research: `canonical filter surface consolidation`

Cross-surface discovery (rag-driven) of where filtering UX lives across the
dashboard's four surfaces — left rail, graph stage, timeline, right activity
rail — to ground the decision to nominate ONE canonical filter location and
retire every surface-local filter affordance. This is a *placement and
ownership* question, not a state-plane question: the sibling `filter-controls`
cycle already settled WHAT the filter contains and proved the state plane is
already centralized. This research asks WHERE the controls may live.

## Findings

### The filter STATE is already one canonical plane

There is a single `GraphFilter` shape on `dashboardState.filters` carrying
tiers, confidence, relations, structural-state, kinds, doc-types, feature-tags,
`feature_query` (glob/regex), statuses, plan-tiers, health, date-range, and
text. Every surface that filters reads and writes this one slice through stores
hooks (`useDashboardTextFilterDraft`, `useDashboardFilterSidebarIntent`,
`useDateRangeIntent`); the stores layer is the sole wire client. The
centralization gap is therefore NOT in state — it is that the *controls* that
write this state are scattered across surfaces.

### Left rail — a text narrower only, not the full filter

`frontend/src/app/left/RailFilter.tsx` is a single kit `SearchField`
("Filter documents…" / "Filter files…") that narrows the already-fetched
listing client-side; its parent `BrowserRegion.tsx` commits the text through the
canonical dashboard filter draft seam, so "browser narrowing, graph filtering,
and filter chips share one text-filter authority". It hosts NO facet controls
today. The `dashboard-left-rail` ADR deliberately scoped this in-rail filter as
a local listing-narrower, "explicitly not the global search pillar", and drew a
hard line ("two kinds of find must not collide") between it and the graph
filter. That boundary is the thing this decision revises.

### Graph stage toolbar — currently hosts the canonical filter trigger

`frontend/src/app/stage/FilterBar.tsx` is the stage's top toolbar. It composes a
`SearchField` ("Search documents…") for the live text match, a Filter
`IconButton` + active-count `Badge` that opens `FilterSidebar` (the binding
Figma "Filter menu" 217:633 — the full KIND → TOPIC → STATUS → HEALTH → EDITED
facet instrument), an "N of M" node count, and a recoverable filtered-out cost
pill. The busy inline tier-dial + facet-chip strip was already retired from the
toolbar into the sidebar. So the advanced facet instrument lives behind the
GRAPH toolbar trigger today — this is the affordance the decision moves to the
left rail and then retires from the graph.

### Timeline — already free of content filtering

`frontend/src/app/timeline/TimelineControls.tsx` (rebuilt to binding Figma
header 239:714) carries only a from→to date-range pill pair, the
"Steps & summaries" lane-visibility switch, and a zoom/fit cluster. Its comments
record that the prior build's "tier dial, relation/feature facet chips,
jump-to-date input, inline minimap, range-play chip" are RETIRED. The lane
toggle is a phase-visibility key flip, not a content filter. The date range is
written through `useDateRangeIntent` (the timeline is the date-range author).
The timeline thus already satisfies the "no custom filtering except the
interactive Timeline Setter" requirement — the decision ratifies and fences it.

### Right rail — semantic SEARCH, not filtering

`frontend/src/app/AppShell.tsx` `ActivityRail` hosts exactly three tabs —
Status, Changes, Search (binding `ActivityRail` 244:753). The Search tab is the
global semantic search pillar (`POST /search`, target vault/code) backed by its
own `searchIntent` store and `searchController` — a query→result-rows concept,
deliberately distinct from facet/text filtering. The right rail hosts NO facet
filtering of the graph/corpus. So "filtering controls that affect the right
rail" resolves to: the right rail consumes the canonical filter where filtering
applies and must never grow its own filter controls; its semantic Search pillar
is a separate, allowed query affordance that the decision must explicitly fence
from "filtering" so the two concepts are not conflated.

### Decision shape

Nominate the left rail's search/filter area as the ONE canonical filter surface
— a search field plus an advanced facet flyout (KIND/TOPIC/STATUS/HEALTH) — that
writes the single `dashboardState.filters`. The graph stage, the timeline, and
the right rail are pure CONSUMERS/projections of that state and host no
filtering controls: the graph toolbar retires its search box and Filter trigger;
the timeline keeps only the interactive Setter (the sole date-range writer) and
lane visibility; the right rail keeps only its distinct semantic Search pillar.
This revises the `dashboard-left-rail` ADR's local-only in-rail-filter boundary
into a single unified filter, and is the first decision of a centralization
campaign (audit existing edges, coerce them onto the one surface, codify the
law). The timeline-top-bar→graph-top-bar merge is a SEPARATE sibling ADR. See
the sibling ADR for the decision and its constraints.
