---
tags:
  - '#adr'
  - '#graph-timeline-workspace'
date: '2026-06-19'
modified: '2026-06-19'
related:
  - "[[2026-06-19-graph-timeline-workspace-research]]"
  - "[[2026-06-18-editor-dock-workspace-adr]]"
  - "[[2026-06-15-dashboard-timeline-adr]]"
  - "[[2026-06-19-filter-controls-adr]]"
  - "[[2026-06-16-figma-frontend-rewrite-adr]]"
---

# `graph-timeline-workspace` adr: `unify the graph and timeline under one navigation bar` | (**status:** `accepted`)

## Problem Statement

The headline node graph and the bottom timeline were two visually separate
surfaces, each with its own chrome, and navigation was scattered. The graph's top
toolbar was really a filtering instrument — a search field, a filter-sidebar
toggle with an active-count badge, node/cost readout chips, a date-range chip, and
the layout/representation "mode" picker — while the actual graph navigation (zoom,
fit, recenter) and graph settings (force tune, canvas bound, freeze) floated in a
bottom-left cluster and the minimap docked bottom-right. The timeline carried a
THIRD control surface: its own header with date-range pills, a lane-visibility
switch, and a zoom/fit/now cluster. The result was three places to look for
navigation, navigation entangled with filtering, and two surfaces that did not
read as one.

The directive is to treat the graph and timeline as ONE element with two stacked
sections and a fine-tunable buffer between them, to move all navigation into a
single shared top bar, and to SIMPLIFY by removing search, filtering, and the
graph mode switch entirely. The aim is visual clarity and feature simplification:
the timeline owns the temporal overview, the graph owns the 2-D semantic and
hierarchical relations, and the user browses without operating a filter
instrument.

## Considerations

The two sections already stack — the dock workspace (the portal-pinned graph plus
document panels) sits above a resizable timeline footer, separated by a top-edge
resize handle that already serves as the fine-tunable buffer. So unification is a
presentation change, not a new layout engine: retire the timeline's own header so
the lower section reads as part of one element, and host all navigation in one
bar. The portal-pinned canvas contract is untouched — the graph canvas is never
re-parented.

Search, filters, date range, and representation mode are all canonical
dashboard-state with the stores layer as the sole wire client, so removing the UI
controls is safe: the underlying state rests at inert defaults (no text match, no
facets, open date range, the default representation mode), visibility computes to
"all visible", and both sections keep working without their filtering chrome.
Time-travel stays reachable through the playhead; the date-range brush — a
filtering affordance — is the one temporal control dropped.

The static layer-ownership guardrails and the smoke e2e encode the OLD
composition (the stage hosting filter-sidebar seams and toolbar count helpers, the
shell rendering the timeline-controls slot, the graph nav using the
vertical-cluster derived classes, the `data-filter-bar` anchor). A genuine
architecture change updates those guardrails to the new shape rather than routing
around them.

## Constraints

No frontier risk. The change is compositional React over the preserved stores and
`SceneController` contracts; it adds no fetch, mints no model, and reads no raw
tiers block (`view-rewrite-preserves-the-state-and-scene-contract`). It depends
only on stable, shipped features: the dock workspace, the timeline view store, the
graph-controls chrome store, and the filters-vocabulary date bounds. The retained
filter/search/timeline-control modules stay in the stores layer (still tested in
isolation); only their mounting is removed, so the layer boundaries are unchanged.

## Implementation

A single stage top bar replaces the filter toolbar. It is an absolute top-edge bar
over the graph section holding, right-aligned and horizontal: the graph camera
cluster (zoom in / out · a divider · fit · recenter, camera commands only), the
graph-settings gear (the existing canvas-bound, force-tune, and freeze controls in
a popover that now drops DOWN from the bar so it never clips the viewport), a
divider, and the timeline camera cluster (zoom in / out · fit-the-corpus · jump to
now, returning the playhead to LIVE). The create-document action stays at the
leading edge. The camera and settings pieces are factored out of the retired
bottom-left cluster as reusable building blocks so there is one home for each
control.

The graph section keeps only the minimap as a canvas overlay (the category legend
remains as a passive color key). The timeline section loses its header entirely;
its navigation lives in the shared bar and the resize handle above it is the
buffer between the two sections. The search field, the filter sidebar and its
toggle/badge, the node/cost chips, the date-range chip, the layout/representation
mode switch, the timeline date-range pills, the lane-visibility switch, and the
date-range brush are all removed from the rendered surface. The layer-ownership
guardrails and the smoke selector are updated to assert the new composition.

## Rationale

The research (F1–F5) shows the unification is mostly presentational and the
removal is safe because the state plane already centralizes every retired control,
so the chrome can be dropped without touching behavior or the engine. Consolidating
navigation into one bar removes the three-places problem and the
navigation/filtering entanglement, which is exactly the clarity the directive
asks for. Keeping the building blocks (camera cluster, settings gear) as composed
kit pieces honors `design-system-is-centralized`; updating rather than bypassing
the guardrails honors that the architecture genuinely changed.

## Consequences

Gains: one obvious place for every navigation control; the graph reads clean (only
the minimap overlays it); the timeline reads as the lower section of one element;
far less chrome to understand. The simplification is honest — removed controls are
gone, not hidden, so nothing renders a dead affordance.

Costs and pitfalls: the retired filter/search/mode-switch modules remain in the
tree as unmounted-but-tested code, which is a cleanup candidate once it is certain
they will not return. Power-user reach is reduced — faceted filtering, free-text
search, and explicit layout-mode switching are no longer surfaced; if any is
wanted back it should return as a deliberate, single-home control (e.g. the left
rail per the filter-consolidation direction), never as a second scattered toolbar.
Representation mode now rests at its default; time-travel remains available only
through the playhead.

## Codification candidates

