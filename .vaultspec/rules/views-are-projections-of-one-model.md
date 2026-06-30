---
name: views-are-projections-of-one-model
---

# Views are projections over one model; model/view ownership is already settled

## Rule

Every dashboard view — graph, tree, table, timeline — is a projection and
consumer over the single model (the engine's `LinkageGraph`, mirrored
client-side by `frontend/src/stores/`), never a new model nor a new model/view
layer. Adding a view means adding a projection in `engine-query` and a
query/selector in `frontend/src/stores/`, then a dumb view component that
subscribes and emits intent (select, hover, expand) back; the view never
`fetch`es the engine, never defines its own node shape, and never reads the raw
`tiers` block. Shared dashboard intent — selection, hover, filters, date range,
timeline mode, graph query identity, graph bounds, and shared panel affordances
— lives in backend dashboard-state and is consumed through TanStack-backed
stores helpers; local view stores may hold only local chrome or entity metadata
that is not part of the shared dashboard contract.

## Why

The Qt-style model/view separation already exists and is already owned, so a new
view almost never needs new architecture. The model is the engine `LinkageGraph`
(`engine-graph`, typed by `engine-model`); `engine-query` already projects it
many ways (`/graph/query` is the node-graph projection, `/vault-tree` is the tree
projection, plus `/nodes`, `/neighbors`, `/events`); `frontend/src/stores/` is
the sole wire client — the client-side model — and `frontend/src/scene/` and
`frontend/src/app/` are views. The 2026-06-14 model/view advisory (the "who owns
the model/view for a tree view" question) confirmed that proposing a fresh node
schema, an ADR, or a per-view "projection-family" abstraction just to add a tree
view was premature authoring: the existing boundaries in
[[dashboard-layer-ownership]] already settle who owns the model and already
forbid a view from touching the wire. The failure mode this prevents is every new
view growing its own endpoint and its own fetch, re-scattering wire access and
recreating the [[mock-mirrors-live-wire-shape]] drift across N views instead of
one.

The `2026-06-17-dashboard-state-centralization-audit` reaffirmed this rule for
state synchronization: duplicated local selection, filter, date-range, panel,
and graph-query state produced split-brain behavior across the left panel, right
panel, timeline, and graph stage. The final review also showed that even the
canonical state engine must preserve the route's own served ids and merge
partial backend state atomically, or subscribers can observe stale or reverted
intent.

## How

- **Good:** a tree view subscribes to the existing `/vault-tree` store query
  through a stores selector and emits select/expand intent back — no new fetch,
  no raw `tiers`, no new model.
- **Good:** a genuinely new projection (e.g. a table) lands as a projection in
  `engine-query` over the same `LinkageGraph`, surfaced by a stores query; the
  view stays dumb. Generalize the one-off projections into a uniform family only
  when a third or fourth view actually strains them, never speculatively.
- **Good:** a graph, timeline, or rail interaction writes shared intent through
  dashboard-state mutation helpers, and every other surface reads the same
  TanStack dashboard-state snapshot.
- **Bad:** a new view component calling `fetch` against the engine, defining its
  own node type, or motivating a new model/view abstraction layer "to support the
  view" — the model and its ownership already exist; project over it, do not
  re-author it.
- **Bad:** a panel, timeline, or graph component keeping its own copy of shared
  filters, node selection, date range, graph identity, or panel tab state in a
  local store and expecting other views to infer or mirror it.

## Status

Active. Affirmed in the 2026-06-14 model/view advisory: the existing layer
boundaries are sufficient for new views; the discipline is to project over the
one model rather than author new per-view architecture. Sibling of
[[dashboard-layer-ownership]]. Reaffirmed by the 2026-06-17 dashboard-state
centralization campaign for shared dashboard intent and TanStack-backed state.

## Source

Model/view advisory dialogue, 2026-06-14 (tree-view-vs-node-graph framing; the
Qt model/view analogy resolved onto the existing layers). Sibling rules
[[dashboard-layer-ownership]] (the one-way data boundaries this builds on),
[[mock-mirrors-live-wire-shape]] (the drift it prevents), and
[[graph-queries-are-bounded-by-default]] (projections stay bounded). Model owner:
`engine-model` / `engine-graph` `LinkageGraph`; projection seam: `engine-query`;
client model: `frontend/src/stores/`.
State authority source:
`2026-06-17-dashboard-state-centralization-audit` (resolved findings
`dashboard-patch-006` and `feature-selection-007`).
