---
tags:
  - '#audit'
  - '#global-state-review'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-graph-implementation-review-audit]]"
---

# `global-state-review` audit: `application global state and filtering`

## Scope

User-briefed audit (2026-07-02) of the application's global view/UI state and the
filtering data path. The app browses and visualizes the vault (linked markdown nodes,
grouped by feature tags and relationship edges) and offers temporal (timeline
date-range) and per-feature/per-doc-type filtering. Two questions were audited:

1. DATA: how is the corpus served, cached, and optimized for fast filtering — is the
   architecture correct, and what is the filtering workload split between backend and
   frontend?
2. STATE: how well is the global data/view state managed — is one dataset manipulated
   by the temporal, feature-tag, and doc-type filters; is there a uniform "global data
   view window changed" signal all React and graph components react to; and are UI
   reactions (selections, framings, autoscrolls) wired to respond to data-model
   changes?

Grounded in the codified rules (`one-filter-authority-every-corpus-view-consumes-it`,
`filtering-has-one-canonical-surface`, `node-facets-filter-on-the-engine`,
`views-are-projections-of-one-model`, `dashboard-layer-ownership`,
`display-state-is-backend-served-not-frontend-derived`,
`client-narrowed-listings-hold-the-full-paginated-set`, `stable-selectors`,
`derived-projections-memoize-on-the-graph-generation`,
`graph-queries-are-bounded-by-default`) and on direct reads of the epicenter seams:
`frontend/src/stores/server/dashboardState.ts`, `frontend/src/stores/server/queries.ts`,
`frontend/src/stores/server/graphSync.ts`, `frontend/src/stores/view/viewStore.ts`,
`frontend/src/stores/view/graphAffordances.ts`,
`frontend/src/stores/view/dashboardFilterChoices.ts`,
`frontend/src/app/timeline/TimelineRangeSelector.tsx`,
`frontend/src/app/timeline/RangeSelect.tsx`, `frontend/src/app/timeline/Timeline.tsx`,
`frontend/src/scene/three/threeField.ts`, `engine/crates/engine-query/src/filter.rs`,
`engine/crates/engine-query/src/graph.rs`,
`engine/crates/vaultspec-api/src/routes/temporal.rs`.

Audit-only; no product code changed. Finding IDs are stable (`GS-###`); severities
HIGH/MEDIUM/LOW plus info entries recording what was verified sound. This audit is the
second surface of the standing review whose first surface (graph implementation) lives
in the related `2026-07-02-graph-implementation-review-audit`; cross-referenced
findings there use `GIR-###` ids.

## Findings

### GS-001 | info | Verified: one canonical view-window record with one write seam IS the uniform "view window changed" signal

The intent the briefing assumed is implemented and structurally sound. The per-scope
`DashboardState` (backend-persisted, engine-validated) is the single view-window
record: `filters` (doc_types, statuses, feature_tags, feature_query, plan_tiers,
health, text, tiers, min_confidence), the TOP-LEVEL `date_range` (deliberately not a
facet), `timeline_mode`, `graph_granularity`, `salience_lens`/`focus`,
`selected_ids`/`hovered_id`, `representation_mode`, `panel_state`. Every write goes
through one seam — `patchDashboardState`
(`frontend/src/stores/server/dashboardState.ts:239-251`): PATCH → the server returns
the MERGED state → `updateDashboardStateCache` swaps the one TanStack entry
atomically. That snapshot swap is the global signal: every consumer derives from it —
the graph slice's query identity (`dashboardGraphQueryVariables`,
`dashboardState.ts:832-844`), the timeline's lineage filter arg
(`dashboardLineageFilterArg`), and the rail facets (`useVaultRailFacets`,
`queries.ts:1564-1580`) — so a facet toggle is one snapshot change fanning into keyed
refetches, with `placeholderData: keepPreviousData` preventing blanking. A SECOND,
distinct signal covers corpus (data-model) changes: the SSE `graph` delta clock →
debounced generation invalidation + feature-delta splice (`graphSync.ts`). Two
signals, no ad-hoc event bus — the correct shape. The temporal criterion
(`timeline_date_criterion` setting: created/modified/stamped) is threaded
CONSISTENTLY into all three consumers (`queries.ts:1725-1768` rail narrow,
`:1851-1858` lineage arg, `:2835-2838` graph query `date_field`), and the engine
filter grammar honors it (`engine-query/src/filter.rs:509-513`).

### GS-002 | info | The "singular dataset" is realized at the model+state level, not as one client dataset — and that is the correct architecture

The briefing's assumption ("a singular dataset manipulated by the timeline,
feature-tag, and doc-type filters") holds at two of three levels and deliberately not
the third. BACKEND: one `LinkageGraph` per scope; every view is a projection over it
(`views-are-projections-of-one-model`), narrowed by ONE shared `Filter` grammar
(`/graph/query` and `/graph/lineage` accept the same JSON). STATE: one filter record
narrows all views in lock-step (GS-001). CLIENT DATA: intentionally THREE cached
projections — the bounded graph slice, the timeline's full bounded lineage set
(fetched once; scroll/zoom/date-window are pure in-memory windowing —
`Timeline.tsx:987-1004`), and the full-pagination vault-tree listing — because one
shared client dataset would violate the bounded-slice rules and each view needs a
different projection shape. Workload split: ALL corpus-narrowing facets apply on the
ENGINE (per-generation memoized candidate indexes + enriched views, bounded slices,
honest truncation — see GIR-013 in the related audit); the client narrows only what it
fully holds: (a) the rail tree (a sanctioned client narrow over the COMPLETE paginated
listing, `client-narrowed-listings-hold-the-full-paginated-set`), (b)
`computeVisibility` masking over the held slice (covers client-added ego/pin nodes the
server query never saw), (c) the timeline's date-range crop over its full fetched set.
The date_range asymmetry is deliberate, documented, and correct: the graph and rail
CONSUME `date_range` as a narrowing input while the timeline (its sole writer)
excludes it from its own lineage facet so the axis is never double-applied
(`dashboardState.ts:694-705`).

### GS-003 | medium | No scroll-positioning reactions exist anywhere: selection never scrolls the rail row or the timeline into view

The briefing asked whether autoscrolls respond to model changes: they do not,
anywhere. `scrollIntoView` (or any equivalent scroll-positioning call) has ZERO
occurrences under `frontend/src`. Cross-region selection sync is otherwise well-wired
— a rail or search selection rings the graph node, focuses the camera (`focus-node`),
spotlights a feature cohort durably, and highlights the rail row — but the scroll
dimension is missing on every surface: selecting a node from the graph/search/palette
does not scroll the left-rail tree to reveal the selected document's row (a deep tree
leaves the highlighted row off-screen); a selection does not scroll/center the
timeline strip to the selected node's date; the working-set/opened islands have no
reveal either. Failure scenario: user clicks a node on the canvas, glances at the rail
— the highlight exists but is scrolled out of view, so the selection appears to have
"done nothing" in the rail. Fix shape: a stores-owned "reveal selection" reaction per
projection surface (rail row `scrollIntoView` on canonical `selected_ids` change when
the row is off-viewport; timeline `scrollOffset` ease to the selected node's date via
the existing shared `pxPerMs`/`scrollOffset` store), gated on non-scene-originated
selections the same way the camera focus bounce already is.

### GS-004 | medium | Ghost emphasis on filtered-out nodes: selection/pin rings and tracked anchors ignore the visibility mask, and canonical selection is never reconciled

Three layers disagree about a node that the filter has hidden. (1) The scene's ring
pass (`threeField.ts` `drawLabels` ring loop, ~:1926-1970) draws
selected/pinned/pulsed rings with NO `visibleNodeIds` check — while the LABEL pass
(`labelVisible`, `threeField.ts:2097-2109`) and picking (`pickNodeAtScreen`) both
honor the mask and the node BODY is scaled to zero (`aHidden`). Net: select a node,
then apply a filter that hides it → a floating accent ring (or dashed pin ring) over
empty canvas at the node's position. (2) `emitAnchors` (`threeField.ts:1878-1891`)
emits screen anchors for tracked nodes regardless of visibility, so an opened island
or hover card stays pinned over a hidden node. (3) The canonical `selected_ids` in
dashboard state is never reconciled against filter visibility OR slice membership:
`pruneNodeAffordances` (`stores/view/viewStore.ts:918-943`) prunes only VIEW-LOCAL
affordances (event selection, working set, openedIds, hover) and only by MODEL
membership — the canonical selection survives indefinitely. Selection SURVIVING a
filter round-trip is arguably desirable (a user un-filtering gets their selection
back); the defect is the ghost presentation while hidden. Fix shape: gate the ring
pass and `emitAnchors` on the same `visibleNodeIds` mask the labels already use
(rings/anchors reappear when the filter releases the node — no state change needed).

### GS-005 | low | Mask-mode affordance retention: pruning is by model membership, so islands/working-set survive nodes their filter has hidden

`useGraphAffordanceReconciliation` (`stores/view/graphAffordances.ts`) prunes
affordances when nodes leave the held MODEL — which happens in reflow filter mode
(true removal) and on scope/data changes, but NOT in the default mask mode, where a
filtered-out node remains in the model and only its visibility drops. Consequence: an
opened island or a working-set chip can reference a node the user cannot currently
see (its ego edges also hidden), which reads as an inconsistency rather than a bug —
it is coherent with "mask = stable positions, nothing removed" semantics, but the two
modes present differently for the same filter. Worth a deliberate call: either keep
(and let GS-004's anchor gating hide the island with its node), or prune visibly-dead
affordances in mask mode too. Recorded as a design-consistency observation, not a
defect.

RESOLUTION (2026-07-02, post-GS-004): KEEP mask-mode retention — recommended and
closed as the accepted design. With GS-004 landed, the apparent inconsistency
dissolves: the uniform invariant is "affordances are valid iff their node is in the
HELD MODEL", and it holds in BOTH modes (reflow removes nodes from the model, so
pruning fires; mask keeps the model, so retention is the same rule, not an
exception). Visibility is PRESENTATION, and GS-004 completed the presentation
gating (rings, anchors, islands, hover cards all hide with the node). Pruning on
mask would make a transient filter DESTRUCTIVE of session state — a user narrowing
to one doc-type for a moment and back would lose their opened islands and working
set — which contradicts the mask mode's non-destructive contract and is asymmetric
with the deliberate canonical-selection-survives decision. One optional presentation
polish remains open (not blocking closure): the working-set CHIP TRAIL is not
canvas-anchored, so GS-004 does not touch it — a chip whose node is currently
filter-hidden could dim or badge ("hidden by filter") so the trail stays honest;
state unchanged.

## Recommendations

- Add stores-owned "reveal selection" scroll reactions per projection surface — rail
  row scroll-into-view, timeline scroll-to-date — gated on non-scene-originated
  selections like the existing camera focus bounce (GS-003).
- Gate the scene's ring pass and `emitAnchors` on the `visibleNodeIds` mask the label
  pass already honors, so a filtered-out node never shows a ghost ring or a floating
  island anchor (GS-004).
- Decide mask-mode affordance retention deliberately: either keep it (with GS-004's
  anchor gating hiding the island alongside its node) or prune visibly-dead
  affordances in mask mode too (GS-005).
- No architectural change is recommended for the data path or the state model: the
  one-record / one-write-seam / two-signal design (GS-001) and the
  engine-side-filtering split (GS-002) are correct and rule-conformant; the remaining
  work is confined to the reaction layer.
