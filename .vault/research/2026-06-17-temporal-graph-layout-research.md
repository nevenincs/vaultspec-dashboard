---
tags:
  - '#research'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-15-dashboard-timeline-adr]]"
  - "[[2026-06-15-dashboard-timeline-research]]"
---

# `temporal-graph-layout` research: `day-anchor force timeline`

The question researched here is whether the existing graph interface can gain a temporal representation where nodes are laid out on a horizontally scrollable timeline canvas, attracted strongly to day anchors while ordinary graph edges remain visible but do not dominate node placement.

## Findings

### F1 — The model already supports the premise

The existing timeline is already designed as a projection over the same graph model, not as a separate model. The accepted timeline ADR defines a bounded temporal-lineage projection that returns dated document nodes in a range together with the self-consistent edges among them. The frontend timeline reads that lineage slice, maps dates through the scroll-strip coordinate helpers, and virtualizes the visible range. That means the product idea is conceptually aligned with the current architecture: a temporal graph layout should be another representation of the graph, not a new data source.

### F2 — The current timeline is bounded and deterministic, but not a simulation

The current timeline renderer places marks at exact timestamp-derived x coordinates and stacks them deterministically into lanes. It is good for readable chronology, keyboard access, and bounded range queries, but it does not use the graph field or the force simulation. Dense days collapse into cluster buttons rather than forming physically settled day neighborhoods. This is why temporal mode can feel mute relative to the graph: it is a chart projection, not a live graph representation.

### F3 — A day-anchor force layout is feasible if x is authoritative and y is simulated

The viable shape is not a fully free force simulation. The bounded shape should treat time as the primary coordinate: each visible day or bucket owns an x anchor, and nodes with that day receive a strong x force toward the anchor. The y coordinate can be solved by collision, mild centering, lane/group bias, and optional local spreading. Edges can still render as arcs or curves, but their force strength should be zero or very low in temporal mode so they do not pull nodes away from their day. This preserves temporal truth while still allowing the graph to feel alive.

### F4 — The bounded canvas should be a virtualized horizontal world

The simulation should not run over the whole corpus. It should run over the same visible time window plus margin that the timeline already uses. The world width is derived from the visible range in pixels, plus overscan. The viewport scroll offset maps the world to screen coordinates. The simulation rectangle can be fixed-height and horizontally large, but only the visible slice is loaded and simulated. This keeps the design consistent with bounded-by-default graph queries.

### F5 — Cosmos may not be enough as-is for custom day forces

The graph field is currently Cosmos-owned. Cosmos configuration can tune link, repulsion, gravity, centering, decay, and related parameters, but custom per-node day anchor forces are not exposed as a first-class hook in the current seam. A temporal graph mode can still use Cosmos for rendering and interaction if positions are precomputed or periodically reseeded, but a true custom day-anchor simulation likely needs either a small CPU layout worker that emits positions or a new field-level layout path that treats temporal mode as a deterministic seed plus local relaxation.

### F6 — The safest first implementation is a deterministic temporal seed, not a live custom force

The first useful version should compute positions from the existing lineage slice: x from date, y from lane/group plus collision packing. This can be added as a representation layout mode without changing backend shape. Once that works, a local relaxation pass can improve day clusters. Only after that should the project decide whether to extend the Cosmos seam for live anchor forces. This minimizes risk and lets the user evaluate whether day clusters improve comprehension.

### F7 — Edge rendering should remain, but force contribution should be mode-specific

In temporal mode, edges should be visual evidence, not spatial authority. Declared, structural, temporal, and semantic edges can still render with tier treatment and hover ego highlighting, but their link force should either be disabled or set low enough that day membership wins. Temporal edges may deserve visual emphasis, but not simulation dominance.

## Recommendation

The idea is feasible and fits the architecture, provided temporal mode is treated as a graph representation over the bounded lineage slice. The recommended implementation path is:

1. Add a temporal representation layout that uses the existing scroll-strip date mapping for x and a bounded collision/packing layout for y.
2. Keep the backend as `/graph/lineage` initially; do not introduce a new temporal graph API until the UI proves it needs different fields.
3. Render graph edges in the graph field, but disable or sharply reduce edge force in temporal mode.
4. Add day or bucket anchors as visible guide structures and as debug-overlay counters.
5. Promote to a true live day-anchor simulation only after the deterministic version proves useful.

The main design constraint is that time must remain authoritative. If edge forces can drag nodes away from their date, the view stops being a timeline and becomes a misleading graph with calendar decoration.
