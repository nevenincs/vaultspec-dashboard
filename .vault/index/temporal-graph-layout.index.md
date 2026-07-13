---
generated: true
tags:
  - '#index'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
related:
  - '[[2026-06-17-temporal-graph-layout-W01-P01-S01]]'
  - '[[2026-06-17-temporal-graph-layout-W01-P01-S02]]'
  - '[[2026-06-17-temporal-graph-layout-W01-P01-S03]]'
  - '[[2026-06-17-temporal-graph-layout-W01-P02-S04]]'
  - '[[2026-06-17-temporal-graph-layout-W01-P02-S05]]'
  - '[[2026-06-17-temporal-graph-layout-W01-P02-S06]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P03-S07]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P03-S08]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P03-S09]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P04-S10]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P04-S11]]'
  - '[[2026-06-17-temporal-graph-layout-W02-P04-S12]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P05-S13]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P05-S14]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P05-S15]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P06-S16]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P06-S17]]'
  - '[[2026-06-17-temporal-graph-layout-W03-P06-S18]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P07-S19]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P07-S20]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P07-S21]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P07-summary]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P08-S22]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P08-S23]]'
  - '[[2026-06-17-temporal-graph-layout-W04-P08-summary]]'
  - '[[2026-06-17-temporal-graph-layout-adr]]'
  - '[[2026-06-17-temporal-graph-layout-audit]]'
  - '[[2026-06-17-temporal-graph-layout-plan]]'
  - '[[2026-06-17-temporal-graph-layout-research]]'
---

# `temporal-graph-layout` feature index

Auto-generated index of all documents tagged with `#temporal-graph-layout`.

## Documents

### adr

- `2026-06-17-temporal-graph-layout-adr` - `temporal-graph-layout` adr: `cosmos-temporal-cluster-canvas` | (**status:** `accepted`)

### audit

- `2026-06-17-temporal-graph-layout-audit` - `temporal-graph-layout` code review

### exec

- `2026-06-17-temporal-graph-layout-W01-P01-S01` - add a temporal graph slice adapter that maps lineage nodes and arcs into scene nodes and edges
- `2026-06-17-temporal-graph-layout-W01-P01-S02` - preserve visible range and overscan as the sole temporal graph query boundary
- `2026-06-17-temporal-graph-layout-W01-P01-S03` - test lineage-to-scene mapping for bounded nodes, self-consistent arcs, and tier metadata
- `2026-06-17-temporal-graph-layout-W01-P02-S04` - add temporal graph mode to the representation dispatcher and dashboard state contract
- `2026-06-17-temporal-graph-layout-W01-P02-S05` - route the Timeline segment to temporal graph mode while retaining playhead and time-travel state
- `2026-06-17-temporal-graph-layout-W01-P02-S06` - test that the Timeline segment activates temporal graph mode without fetching outside the store layer
- `2026-06-17-temporal-graph-layout-W02-P03-S07` - implement a pure temporal cluster layout helper for bucket anchors, stable ordering, and packed positions
- `2026-06-17-temporal-graph-layout-W02-P03-S08` - expose bucket count, node count, radius, and placement metadata from the layout helper
- `2026-06-17-temporal-graph-layout-W02-P03-S09` - test same-day density, deterministic ordering, finite positions, and bucket separation
- `2026-06-17-temporal-graph-layout-W02-P04-S10` - teach the representation dispatcher to upload temporal seed positions to the Cosmos field
- `2026-06-17-temporal-graph-layout-W02-P04-S11` - suppress or pause normal link-force simulation when temporal graph mode is active
- `2026-06-17-temporal-graph-layout-W02-P04-S12` - extend debug snapshots with temporal range, bucket counts, and simulation status
- `2026-06-17-temporal-graph-layout-W03-P05-S13` - mount the Cosmos graph surface as the Timeline main marks area
- `2026-06-17-temporal-graph-layout-W03-P05-S14` - preserve individual node hover, selection, pulse, and accessible mark summaries on the canvas surface
- `2026-06-17-temporal-graph-layout-W03-P05-S15` - keep minimap, range, scroll, zoom, and playhead controls driving the temporal graph range
- `2026-06-17-temporal-graph-layout-W03-P06-S16` - render day bucket guides and hotspot cues without replacing individual document nodes
- `2026-06-17-temporal-graph-layout-W03-P06-S17` - retain graph edges with tier styling and ego highlight while keeping them non-authoritative for layout
- `2026-06-17-temporal-graph-layout-W03-P06-S18` - surface truncation, degradation, and bucket density in the debug interface
- `2026-06-17-temporal-graph-layout-W04-P07-S19` - add integration tests for temporal representation mode and scene controller behavior
- `2026-06-17-temporal-graph-layout-W04-P07-S20` - run frontend typecheck and focused vitest coverage for timeline canvas integration
- `2026-06-17-temporal-graph-layout-W04-P08-S22` - refresh the feature index and validate the temporal graph layout vault artifacts
- `2026-06-17-temporal-graph-layout-W04-P08-S23` - run a code review against the completed implementation and halt for review
- `2026-06-17-temporal-graph-layout-W04-P07-S21` - verify in browser that a dense same-day slice shows individual clustered nodes on the Cosmos surface
- `2026-06-17-temporal-graph-layout-W04-P07-summary` - `temporal-graph-layout` `W04.P07` summary
- `2026-06-17-temporal-graph-layout-W04-P08-summary` - `temporal-graph-layout` `W04.P08` summary

### plan

- `2026-06-17-temporal-graph-layout-plan` - `temporal-graph-layout` plan

### research

- `2026-06-17-temporal-graph-layout-research` - `temporal-graph-layout` research: `day-anchor force timeline`
