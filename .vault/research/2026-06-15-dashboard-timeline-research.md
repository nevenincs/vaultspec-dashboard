---
tags:
  - '#research'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-timeline-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-timeline` research: `relational phase-lane timeline`

This research investigates how to represent a vault document corpus as a
horizontally-scrollable, left-to-right timeline that draws not only *when* each
document (commit, plan, ADR, execution record, audit, rule) entered the corpus
but *how those documents are connected* — so the temporal overview and the
relational lineage are both legible at once. It grounds the build-out of the
timeline surface beyond the accepted re-skin ADR, which deliberately re-stated
the existing fixed-lane density timeline under the new design language and did
not draw relationality. The chosen representation idiom — confirmed with the
product owner — is a **phase-lane arc diagram**: pipeline-phase lanes, dated
document nodes, and derivation arcs flowing left-to-right across the lanes.

## Findings

### F1 — Current state: the surface exists, but as a non-relational re-skin

The timeline surface already exists and works (`frontend/src/app/timeline/`:
`Timeline.tsx`, `Playhead.tsx`, `RangeSelect.tsx`, `timeTravel.ts`,
`eventSelection.ts`). It was re-skinned onto the OKLCH token layer and the
Phosphor domain marks per the accepted timeline ADR. Its representation is:

- **Three fixed lanes** — commits, documents, lifecycle (`laneOf` in
  `Timeline.tsx`), heterogeneity carried per-event by the mark, not by lanes.
- **Fit-to-window zoom**, not a scrollable strip: a `TimeWindow {from,to}` is
  mapped to the host width with `timeToX`, and a mouse wheel zooms the window
  (`zoomWindow`) anchored under the cursor. There is no horizontal scroll; the
  whole visible range is always exactly the host width.
- **Zoom-as-aggregation**: coarse zoom renders engine density buckets
  (`counts_by_kind` rects); fine zoom resolves individual marks under a
  client `RAW_MARK_CAP = 500`.
- **No relational edges.** Events never reference each other; the only join is
  per-event `node_ids` used to *pulse* stage nodes on click. The lineage that
  connects a research note to its ADR to its plan to its execution records is
  entirely absent from the surface.

The gap the product owner wants closed: the lineage *is* the point. "Which
document was offered when, and how these are connected" requires drawing the
edges, and a fit-to-window view cannot host an honest left-to-right read of a
multi-month corpus — it needs to scroll.

### F2 — The timeline is a temporal projection of the one model (no new model)

Relationality already exists in the engine; the timeline does not invent it.
The engine's `LinkageGraph` (`engine-graph/src/graph.rs`) holds nodes and typed
`Edge`s (`engine-model/src/lib.rs`): `Edge {src, dst, relation, tier,
confidence, state, provenance, observed_at}`, with four provenance `Tier`s
(`Declared`, `Structural`, `Temporal`, `Semantic`) and a `RelationKind`
vocabulary (`Fulfills`, `Implements`, `Resolves`, `Reviews`, `References`,
`Mentions`, `Touches`, `Resembles`, `Contains`, `CoreDerived`). The graph keeps
a `NodeId → [EdgeId]` adjacency (`edges_of`) so the edges incident to any node
are O(degree).

Crucially, the pipeline lineage the timeline must draw is **already a planned
engine concept**. The node-semantics ADR introduces an *additive* `derivation`
edge field — orthogonal to the inference `tier` — carrying the framework
relationship between documents: `grounds` (research/reference → ADR),
`authorizes`/`binds` (ADR → plan), `generated-by` (plan → exec, with the
`W##/P##/S##` container path), `aggregates` (exec → summary), `reviews`
(plan/exec → audit), `promoted-from` (audit → rule), plus the feature-membership
star (all docs sharing a `#feature` tag). This is exactly the research → ADR →
plan → execution → audit → rule chain the phase-lane arcs must render.

Therefore, per the views-are-projections discipline, the timeline is a **new
temporal projection over the existing `LinkageGraph`**, not a new model and not a
new per-view abstraction: a projection in `engine-query` plus a selector in
`frontend/src/stores/`, then a dumb view. The timeline ADR's own "Pathways
opened" section anticipated exactly this ("a per-feature growth view ... is an
addition of a projection plus a selector, not new architecture").

### F3 — Backend gap: events carry a node join, but no event↔event edges

`GET /events` (`vaultspec-api/src/routes/temporal.rs`, projection in
`engine-query/src/events.rs`) serves heterogeneous dated events
(`RawEvent {id, ts, kind, ref, node_ids[], truncated_node_ids}` or bucketed
`{from, to, counts_by_kind}`). `node_ids` is load-bearing but is a join to graph
*nodes*, never to other events. There is **no wire surface today that returns,
for a scope and time range, the dated nodes together with the edges among
them**. The relational arcs therefore need one of:

- **(a) Client-derive** — fetch `/events` for the dates, then `/graph/query`
  (or per-node `/nodes/{id}/neighbors`) for the edges, and join client-side on
  `node_ids`. Reuses existing endpoints; but it splits one logical read across
  two unbounded-ish calls, forces the client to reconcile two payloads and to
  re-derive which edges fall in-range, and re-creates the per-view fetch-join
  the layer rules discourage.
- **(b) A dedicated bounded temporal-lineage projection** (recommended) — a new
  `engine-query` projection serving, for `scope + from/to + filter`, the dated
  document nodes in range *and* the edges among them (declared + the `derivation`
  relations, optionally tier-filtered), each node carrying its pipeline-phase and
  its date, edges carrying relation/derivation/tier. Bounded by the document node
  ceiling with an honest `truncated` block; blob-true dates from the git object
  DB; semantic tier present-only. This is one projection of the one model behind
  the shared envelope (carries the `tiers` block), surfaced by one stores
  selector — the architecturally clean path and the one the projection rules
  point at.

Option (b) is the recommendation. It keeps the timeline a dumb projection,
keeps reads bounded and honest, reuses the keyframe/diff temporal machinery for
time-travel, and isolates the lineage shape behind one mock-mirrors-live
selector rather than scattering a two-call join across the chrome.

### F4 — Representation design: the phase-lane arc diagram

**Lanes are pipeline phases.** Instead of commits/documents/lifecycle, the lanes
are the framework pipeline rows (research/reference · adr · plan · exec ·
review · codify), with commits as a thin ambient base rule rather than a peer
lane. A document's lane is a pure function of its doc-type (research/reference →
research lane, adr → adr lane, plan → plan lane, exec records/summaries → exec
lane, audit → review lane, rule → codify lane), so the lane assignment is
deterministic and stable. This gives the left-to-right read an inherent vertical
structure: you can see the pipeline shape (how far a feature got) at a glance.

**Nodes are dated document marks.** Each document is a node positioned at its
date on the x-axis, in its phase lane, drawn with its Phosphor domain mark
(shape-first, grayscale-legible at 14px per the iconography rule). The date is
the document's creation instant (blob-true), with modification optionally shown
as a faint trailing tick. Node salience (size/weight) can ride degree or
feature-importance, reusing the salience concepts from the node-salience ADR but
kept simple for v1.

**Arcs are derivation edges.** A relation between two documents is drawn as an
arc connecting their two marks. Because the lanes are phase-ordered and the
x-axis is time, the derivation chain naturally reads as arcs flowing
left-to-right and downward (research → adr → plan → exec) then back up to review
and codify — the lineage of a feature is a visible thread. Arc treatment reuses
the established **tier-as-treatment** encoding from `frontend/src/scene/field/
edgeMeshes.ts` (declared = solid inked, structural = solid status-hued, temporal
= dotted, semantic = soft haze), so the same edge vocabulary the stage uses
reads identically here; the `derivation` relation labels the arc on hover.

**Density and bundling preserve the overview.** A multi-month corpus has too many
arcs to draw raw. The graph-representation ADR already settled the discipline:
**hierarchical edge bundling (HEB) along the feature/lineage containment** with
**disparity filtering** to thin temporal/semantic edges to their significant
subset, DOI-gated, and **un-bundled on hover**. The timeline reuses this: at
coarse scroll/zoom, arcs bundle along feature lineage so cross-feature links read
as clean threads, not a hairball; hovering a node lifts its 1-hop ego (the
ego-highlight + dim-the-rest pattern from the node-canvas ADR) and un-bundles its
arcs. Density of *marks* (not arcs) still collapses to per-lane count glyphs at
the coarsest zoom, preserving the existing zoom-as-aggregation idea.

**The scrollable model.** The fit-to-window `TimeWindow` is replaced by a
scroll-strip model: a scale of *pixels-per-unit-time* (zoomable) and a scroll
offset, with the visible range a window onto a larger virtual width. Marks and
arcs are virtualized to the visible range plus a margin so the surface stays
bounded regardless of corpus age. An overview/minimap ribbon gives whole-corpus
orientation and fast navigation. The playhead docks LIVE at the right (the
present), and scrolling left walks back in time — preserving the LIVE-at-right
mental model from the current surface.

### F5 — Frontend state design

The surface stays app-chrome and reads everything through stores, owning no wire
access (dashboard-layer-ownership). Concretely:

- **A lineage query hook** (`useTimelineLineage(scope, range, filter)`) in
  `frontend/src/stores/server/queries.ts`, wrapping the new projection, returns
  the dated nodes + arcs + `tiers` + `truncated`, mirrored exactly by
  `mockEngine` (mock-mirrors-live-wire-shape) and reconciled by a tolerant
  `liveAdapters` adapter. Until the projection lands, the hook can compose
  `/events` + `/graph/query` behind the same selector signature so the view code
  is written once.
- **View state** (scroll offset, pixels-per-time scale, lane visibility,
  hovered/selected node) lives in the timeline's own zustand store (the existing
  `useTimelineStore` extended), distinct from shared cross-surface state.
- **Shared state unchanged**: the playhead still writes `timelineMode`
  (`{kind:"live"} | {kind:"time-travel"; at}`) in `viewStore`; selection still
  flows through the one shared `Selection` concept (extended event/node variants)
  and `bindSelectionToScene`; the **date range is still written only here**
  (`filters.ts` `setDateRange`, the single writer); degradation is still read
  pre-derived from `useSurfaceStates().timeline`. Time-travel still uses the
  keyframe-plus-diff driver on the one delta clock.

### F6 — Control surfaces (the bars)

The owner asked for the control/filter/view bars to be fully specified. Prior art
exists to reuse rather than invent: the stage `FilterBar.tsx` (facet chip group,
`aria-pressed`, vocabulary sourced from the engine `/filters` enumeration, never
hardcoded) and `TierDial.tsx` (four `role="switch"` tier marks, shape-first
identity, confidence-floor sliders, tabular numerals, non-color active cue). The
timeline control bar composes:

- **Phase-lane toggles** — show/hide each pipeline lane (collapse exec when
  scanning high-level lineage).
- **Relation/derivation filter chips** — filter which arc kinds draw
  (grounds/authorizes/generated-by/aggregates/reviews/promoted-from, plus the
  feature-membership star), sourced from the engine enumeration.
- **Tier dial** — reuse the stage tier dial so declared/structural/temporal/
  semantic arcs gate identically; semantic shown inapplicable in time-travel.
- **Feature filter** — focus the timeline on one or more `#feature` tags so the
  arcs collapse to that feature's lineage thread ("history of this feature").
- **Zoom / scale + fit controls** — zoom in/out, fit-all, fit-feature, jump-to-
  date; the overview minimap doubles as a scrubber.
- **Range-select chip** — the committed date range (the single date-range filter)
  rendered as a clearable chip, with play-the-range preserved.

All bar chrome draws from the shared `:root` token layer and the two sanctioned
icon families (Lucide chrome, Phosphor marks); no literal hex, no third icon set.

### F7 — Inherited invariants (unchanged; the ADR must re-affirm)

The new representation must not weaken the hard-won invariants the re-skin ADR
and the foundation contract settled: time-travel honesty + ops-disable driven off
the shared `timelineMode`; one monotonic delta clock shared with the live SSE
channel; the timeline as the single date-range writer; layer ownership (reads via
stores only, never the raw `tiers` block, never a `fetch`); semantic tier
present-only in history; bounded reads with honest truncation; the animated-
transitions motion grammar (add fades in / remove fades out / re-tier staged /
object constancy by stable id / ~1s eased / reduced-motion instant / no-shared-
structure cut / keyboard-initiated never animates); and stable-key identity
(provenance keys are identity-bearing — arcs key off the engine's stable edge
ids, never re-minted client-side).

### F8 — Open questions carried into the ADR

- **Backend shape**: confirm a dedicated bounded lineage projection vs. the
  compose-two-endpoints fallback, and its exact wire shape (does it extend
  `/events`, or stand alone as `/timeline` / `/graph/lineage`?).
- **Node date semantics**: creation-only vs. creation+modification span (does a
  node get a point or a short bar? — leans point for v1, faint modification tick).
- **Arc routing**: above-lane vs. below-lane vs. through-lane arc geometry, and
  how bundling interacts with the phase-lane vertical order.
- **Commits**: ambient base rule vs. a real lane vs. off-by-default (leans
  ambient/off-by-default so the lineage leads).
- **Time-travel of lineage**: does scrubbing animate arcs appearing/disappearing
  (lineage growth) on the one delta clock, and does the lineage projection have
  an as-of/diff form, or does v1 keep time-travel to the stage and the timeline
  shows the static range? (leans: lineage range is the view; the playhead +
  stage diff stay the animated path for v1, lineage growth as a fast-follow).
- **Scale of v1**: full bundling/disparity from the start vs. raw arcs with a
  cap first, bundling as a hardening pass.
