---
tags:
  - '#research'
  - '#graph-timeline-workspace'
date: '2026-06-19'
modified: '2026-06-19'
related:
  - '[[2026-06-18-editor-dock-workspace-adr]]'
  - '[[2026-06-15-dashboard-timeline-adr]]'
  - '[[2026-06-19-filter-controls-adr]]'
  - '[[2026-06-16-figma-frontend-rewrite-adr]]'
---



# `graph-timeline-workspace` research: `unified graph and timeline workspace`

The product owner asked to treat the headline node graph and the bottom timeline
as ONE element with two stacked sections and a fine-tunable buffer between them,
to migrate all navigation into a single shared top bar, and to SIMPLIFY by
removing search, filtering, and the graph layout/representation "mode" switch
entirely. The aim is visual clarity and feature simplification — a
three-dimensional browsing experience where the timeline owns the temporal
overview and the graph owns the 2-D semantic and hierarchical relations — so a
user understands the surface without operating a filtering instrument. This note
grounds the decision; the surface inventory was taken directly from the shipped
frontend.

## Findings

**F1 — The two sections already stack; the buffer already exists.** The stage
column renders the dock workspace (the portal-pinned graph plus document panels)
above a resizable timeline footer, separated by a top-edge resize handle. So
"one element with a fine-tunable buffer" is largely a presentation change:
remove the timeline's own header so the lower section reads as part of the same
element, and share one top bar — not a new layout engine. The portal-pinned
canvas contract (`graph-canvas-is-portal-pinned-never-reparented`) is untouched.

**F2 — The graph's top bar was a filtering instrument, not a navigator.** The
top toolbar carried a search field, a filter-sidebar toggle with an active
count, node/cost readout chips, a date-range chip, and the layout/representation
mode picker. The actual graph navigation (zoom / fit / recenter) and the graph
settings (force tune, canvas bound, freeze) floated in a bottom-left cluster, and
the minimap docked bottom-right. The timeline carried its OWN header (date-range
pills, a lane-visibility switch, and a zoom/fit/now cluster). Navigation was thus
scattered across three places and entangled with filtering.

**F3 — The state plane makes removal safe.** Search, filters, date range, and
representation mode are all canonical dashboard-state, and the stores layer is
the sole wire client (`dashboard-layer-ownership`,
`views-are-projections-of-one-model`). Removing the UI controls leaves the
underlying state at its inert defaults (no text match, no facets, open date
range, the default representation mode) — visibility computes to "all visible"
with no control to change it — so the graph and timeline keep working without
their filtering chrome. Time-travel stays reachable through the playhead; the
date-range brush (a filtering affordance) is the one temporal control dropped.

**F4 — The simplification is a removal, not a migration.** An earlier framing
considered migrating filtering to cohabit the search bar; the settled directive
is to REMOVE search, filtering, and the mode switch outright and keep the bar to
navigation only. The remaining building blocks (the camera cluster and the
settings gear) are reused as horizontal items in the shared top bar; only the
minimap stays a canvas overlay.

**F5 — Guardrails encode the old composition.** The static layer-ownership suite
asserts that the stage hosts the filter-sidebar seams and the toolbar count
helpers, that the shell renders the timeline-controls slot, and that the graph
nav uses the vertical-cluster derived classes. A genuine architecture change must
update those guardrails to the new shape rather than route around them, and the
smoke e2e's `[data-filter-bar]` anchor must move to the new top bar.
