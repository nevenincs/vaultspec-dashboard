---
tags:
  - '#plan'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
tier: L3
related:
  - '[[2026-06-17-temporal-graph-layout-adr]]'
  - '[[2026-06-17-temporal-graph-layout-research]]'
---


# `temporal-graph-layout` plan

Reimplement temporal mode as a Cosmos-backed graph canvas with authoritative date clustering and the existing timeline controls as the navigation skeleton.

## Description

This plan implements the accepted temporal graph layout decision: the current timeline chart becomes a graph interface, backed by the same Cosmos surface used by the graph stage. The bounded temporal-lineage projection remains the read boundary, but its nodes and arcs are mapped into scene graph data, positioned by deterministic day or bucket clusters, and rendered as individual dots so same-day density is visible.

Temporal placement is the invariant. A node's primary x position comes from its date bucket; edges remain visible evidence and can support hover ego behavior, but they do not get to pull nodes away from their temporal anchors. The existing timeline controls, minimap, playhead, range state, selection, and degradation affordances remain conceptually intact while the main marks area moves to the canvas.

## Wave `W01` - temporal data and scene contract

Delivers the bounded lineage slice as scene-ready temporal graph data, keeping the existing timeline range controls as the source of truth for what the canvas receives. Wave W02 depends on this contract before it can place or render nodes.

### Phase `W01.P01` - lineage scene adapter

Maps the bounded temporal-lineage projection into the shared scene node and edge model without introducing a second timeline-only data model.

- [x] `W01.P01.S01` - add a temporal graph slice adapter that maps lineage nodes and arcs into scene nodes and edges; `frontend temporal scene mapping`.
- [x] `W01.P01.S02` - preserve visible range and overscan as the sole temporal graph query boundary; `frontend timeline range state`.
- [x] `W01.P01.S03` - test lineage-to-scene mapping for bounded nodes, self-consistent arcs, and tier metadata; `frontend temporal scene mapping tests`.

### Phase `W01.P02` - representation mode routing

Routes temporal mode through the graph representation seam so the timeline segment enters the same canvas interface as the rest of the graph.

- [x] `W01.P02.S04` - add temporal graph mode to the representation dispatcher and dashboard state contract; `frontend representation mode state`.
- [x] `W01.P02.S05` - route the Timeline segment to temporal graph mode while retaining playhead and time-travel state; `frontend timeline controls`.
- [x] `W01.P02.S06` - test that the Timeline segment activates temporal graph mode without fetching outside the store layer; `frontend graph controls tests`.

## Wave `W02` - date-cluster layout engine

Delivers deterministic temporal positions where date buckets are authoritative and same-day activity appears as individual clustered graph nodes. Wave W03 depends on this layout contract before replacing the visible timeline surface.

### Phase `W02.P03` - temporal cluster primitive

Builds the pure layout primitive that converts dated nodes into stable, collision-aware clusters around day or bucket anchors.

- [x] `W02.P03.S07` - implement a pure temporal cluster layout helper for bucket anchors, stable ordering, and packed positions; `frontend temporal cluster layout`.
- [x] `W02.P03.S08` - expose bucket count, node count, radius, and placement metadata from the layout helper; `frontend temporal cluster layout metadata`.
- [x] `W02.P03.S09` - test same-day density, deterministic ordering, finite positions, and bucket separation; `frontend temporal cluster layout tests`.

### Phase `W02.P04` - cosmos temporal integration

Integrates the temporal positions with the Cosmos field while keeping edges visible and preventing edge forces from overriding date placement.

- [x] `W02.P04.S10` - teach the representation dispatcher to upload temporal seed positions to the Cosmos field; `frontend scene representation layout`.
- [x] `W02.P04.S11` - suppress or pause normal link-force simulation when temporal graph mode is active; `frontend cosmos field simulation`.
- [x] `W02.P04.S12` - extend debug snapshots with temporal range, bucket counts, and simulation status; `frontend graph debug snapshot`.

## Wave `W03` - timeline canvas migration

Replaces the main timeline marks surface with the Cosmos graph canvas while preserving the existing horizontal timeline controls, minimap semantics, selection, hover, and degradation affordances. Wave W04 depends on this end-to-end surface.

### Phase `W03.P05` - canvas surface replacement

Moves the visible timeline body from SVG and HTML marks to the graph canvas without discarding the control skeleton users already have open.

- [x] `W03.P05.S13` - mount the Cosmos graph surface as the Timeline main marks area; `frontend timeline surface`.
- [x] `W03.P05.S14` - preserve individual node hover, selection, pulse, and accessible mark summaries on the canvas surface; `frontend timeline interaction`.
- [x] `W03.P05.S15` - keep minimap, range, scroll, zoom, and playhead controls driving the temporal graph range; `frontend timeline controls`.

### Phase `W03.P06` - temporal visual evidence

Keeps the view graph-readable by showing day density, retained edges, and honest truncation or degradation information without aggregating away individual documents.

- [x] `W03.P06.S16` - render day bucket guides and hotspot cues without replacing individual document nodes; `frontend temporal visual treatment`.
- [x] `W03.P06.S17` - retain graph edges with tier styling and ego highlight while keeping them non-authoritative for layout; `frontend temporal edge rendering`.
- [x] `W03.P06.S18` - surface truncation, degradation, and bucket density in the debug interface; `frontend temporal debug interface`.

## Wave `W04` - verification and review halt

Closes the feature with real-behavior tests, browser verification of clustered temporal density, vault validation, and a review halt before implementation is declared complete.

### Phase `W04.P07` - test and browser verification

Proves the temporal canvas works through pure layout tests, representation integration tests, frontend gates, and real browser inspection.

- [x] `W04.P07.S19` - add integration tests for temporal representation mode and scene controller behavior; `frontend scene representation tests`.
- [x] `W04.P07.S20` - run frontend typecheck and focused vitest coverage for timeline canvas integration; `frontend verification gates`.
- [x] `W04.P07.S21` - verify in browser that a dense same-day slice shows individual clustered nodes on the Cosmos surface; `frontend browser verification`.

### Phase `W04.P08` - vault and review halt

Keeps the VaultSpec paperwork honest and stops at an implementation review boundary after the code and tests land.

- [x] `W04.P08.S22` - refresh the feature index and validate the temporal graph layout vault artifacts; `vault temporal graph layout artifacts`.
- [x] `W04.P08.S23` - run a code review against the completed implementation and halt for review; `temporal graph implementation review`.

## Parallelization

The waves are ordered. W01 defines the scene contract and routing, W02 consumes that contract to produce date-cluster positions and Cosmos simulation behavior, W03 replaces the user-facing timeline surface, and W04 verifies and reviews the completed implementation.

Within W01, P01 and P02 can move together after the lineage shape is confirmed, but S05 must consume S04. Within W02, P03 should land before P04 because Cosmos integration needs the cluster primitive and metadata. Within W03, P05 should land before P06 so visual evidence is tuned against the real canvas surface. W04 is last by design.

## Verification

The implementation is complete when every Step is closed and the temporal view uses the Cosmos graph surface for live temporal mode. A dense same-day slice must render individual clustered nodes, not one aggregate mark, and edge visibility must not move nodes away from their date anchors.

The verification gate requires focused frontend tests for lineage-to-scene mapping, temporal cluster layout, representation-mode routing, and timeline canvas integration. It also requires frontend typecheck, browser verification of clustered same-day density on the live interface, refreshed temporal graph layout vault artifacts, and a final code review halt before declaring the feature done.
