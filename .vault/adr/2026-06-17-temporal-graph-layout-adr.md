---
tags:
  - '#adr'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-17-temporal-graph-layout-research]]"
---

# `temporal-graph-layout` adr: `cosmos-temporal-cluster-canvas` | (**status:** `accepted`)

## Problem Statement

The timeline currently renders as an app-chrome SVG and HTML scroll strip. It is useful as a chronological chart, but it is not the graph interface: it does not use the Cosmos canvas, does not share the graph field's interaction language, and does not present temporal density as a graph cluster. Dense same-day activity is handled by deterministic mark packing and overflow chips, which preserves readability but does not satisfy the desired graph-mode behavior: many documents on one day should appear as many visible dots clustered around that day, so the cluster itself becomes a heat signal.

The decision to persist is whether temporal mode should remain a separate timeline surface or be reimplemented as a Cosmos-backed graph representation that keeps the timeline UX skeleton while using the graph canvas as the actual surface.

## Considerations

The current model already has the right data boundary. The bounded temporal-lineage projection serves dated document nodes in a range together with the self-consistent edges among them. The scroll-strip state already owns pixels-per-time scale, scroll offset, visible-range virtualization, and playhead behavior. The graph field already owns node rendering, edge rendering, hover, selection, zoom, debug snapshots, and Cosmos position upload.

The current Cosmos field can upload explicit point positions and links. That means Cosmos can be the surface for a temporal graph layout even when the coordinates are computed outside Cosmos. The implementation should not depend on a custom internal Cosmos force because the current seam exposes configuration and simulation controls, not a per-node day-anchor force API.

The word cluster is binding here. A day with twenty documents must render as twenty individual graph nodes clustered around that day's anchor, not as one aggregate point. Aggregation may be available as a zoom or overflow affordance later, but the default temporal graph representation must make day density visible through the number and compactness of individual nodes.

## Constraints

Time is authoritative. A node's x position in temporal mode is derived from its date bucket and may not be dragged away by graph connectivity. Edges remain visible as evidence, but they are not the primary layout force in this mode.

The rendered slice must remain bounded. The temporal graph cannot load or simulate the whole corpus. It must use the same visible range plus overscan discipline as the current scroll strip and the same bounded lineage read path unless a later plan proves a new API is needed.

The first implementation must work within the current Cosmos seam. It may upload deterministic or locally relaxed positions and then pause or suppress simulation, or use very low-force simulation for interaction polish. It must not require per-frame external position uploads, because the current field notes that per-tick uploads can break pointer interactivity.

The UX skeleton should remain recognizable: horizontal time navigation, minimap/range affordance, playhead/time-travel behavior, selection, hover, and degradation states stay conceptually the same. The rendering surface changes from the current timeline chart to the Cosmos graph canvas.

## Implementation

Temporal mode becomes a representation of the graph scene rather than a standalone chart renderer. The app continues to request a bounded temporal-lineage slice for the visible range. That slice is mapped into scene nodes and edges, then sent to the Cosmos field.

A new temporal cluster layout computes node coordinates before upload. Each visible day or bucket has a horizontal anchor derived from the scroll-strip time scale. Nodes whose placement date falls on that day are packed around the anchor with deterministic, collision-aware clustering. A compact beeswarm, phyllotaxis, or bounded spiral is acceptable if it preserves individual dots and stable ordering. The cluster radius grows with node count, so busy days read as dense hotspots.

Edges are retained as Cosmos links for visual reading and hover ego behavior. Their layout force is disabled or sharply reduced in temporal mode so declared, structural, semantic, or temporal relationships cannot override date placement. Edge rendering remains useful context, not the spatial authority.

The current timeline components should be treated as the UX skeleton and control layer rather than the final rendering engine. Scroll, zoom, minimap, range selection, and playhead state can continue to drive the visible temporal range. The main marks area is replaced or backed by the Cosmos scene, using the same graph field debug and interaction surface as the rest of the graph interface.

## Rationale

The research concluded that this is feasible and aligned with the existing one-model rule. The current timeline is already a projection over graph lineage data, but it is visually implemented as a chart. Reusing Cosmos for the temporal view makes timeline mode a true graph mode while preserving the bounded read discipline and temporal coordinate model.

Manual date-cluster layout is the pragmatic first step. It gives the desired heat-map behavior immediately, respects time as the primary axis, and avoids depending on Cosmos capabilities that the current seam does not expose. If the deterministic temporal layout proves useful, a later ADR or plan can evaluate whether to extend the field with a custom day-anchor simulation.

## Consequences

The temporal view becomes more coherent with the graph interface: same node rendering, same edge rendering, same hover and selection expectations, and one canvas mental model. Dense days become legible as clusters of individual documents rather than single points or hidden overlap.

The implementation is larger than a cosmetic timeline change. It changes ownership of the main timeline rendering surface and will require careful state routing so scroll-strip controls and Cosmos camera behavior do not fight each other. It also requires debug visibility: the graph debug interface should expose temporal mode, visible range, day buckets, node counts per bucket, and whether simulation is active or suppressed.

The main risk is semantic drift from timeline truth. If graph edges are allowed to pull nodes away from their date anchors, the view becomes a misleading network with calendar decoration. Temporal graph mode must preserve date anchoring as the invariant.

## Codification candidates

- **Rule slug:** `temporal-layout-date-anchors-are-authoritative`.
  **Rule:** Temporal graph layouts must derive the primary x position from the node's date bucket and must not allow edge forces to override date anchoring.
