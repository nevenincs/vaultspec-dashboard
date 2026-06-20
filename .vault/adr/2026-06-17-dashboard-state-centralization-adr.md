---
tags:
  - '#adr'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-17-dashboard-state-centralization-research]]"
---

# `dashboard-state-centralization` adr: `Centralize dashboard state through backend-backed TanStack stores` | (**status:** `accepted`)

## Problem Statement

The dashboard has grown several authorities for the same user-facing concepts:
filters, selection, hover, salience lens, salience focus, date range, graph
granularity, timeline mode, representation mode, panel state, and graph-bound
controls. Some values live in `viewStore`, some in `filters`, some in
`salienceLens`, some in local React state, and some are recomputed ad hoc by the
stage before a TanStack query.

This breaks the dashboard contract that views are projections of one model.
Left panel, right panel, timeline, graph, and scene can present different
versions of the same state, and graph query identity can drift from UI state.
The product direction is explicit: legacy duplicated state must be burned down
and shared dashboard state must be centralized so every surface reads and
modifies through one subscriber model.

## Considerations

The existing dashboard architecture already separates server data, shared view
identity, and scene state. TanStack Query is the accepted server-state surface.
Zustand has been used for shared view identity, and scene state remains behind
the scene controller. That split is still sound for local-only chrome and
per-frame state, but it is not enough for cross-surface product state because
independent stores and local writers have accumulated around the same concepts.

The state that must be centralized is identity-bearing and cross-surface:
scope, selected ids, hovered id, filter facets, date range, timeline mode, graph
granularity, salience lens, salience focus, representation mode, panel state,
and graph bounds. Timeline scroll offset, pixel scale, lane visibility, and
hover affordances are local timeline viewport state unless they change another
surface. Scene positions and animation remain scene-owned.

The backend can own this as bounded session state without changing vault data or
graph semantics. A dashboard-state API can read and patch the current snapshot
through the shared envelope and tiers discipline. TanStack Query can cache that
snapshot and expose typed mutations. Every view then becomes a subscriber and
emits intents through the same mutation helpers.

The route must not become a second graph model. Graph queries still read the
engine graph, filters still compile through the shared graph filter grammar, and
stable node and edge ids still come from the engine. The dashboard-state route
only stores the user's current dashboard intent over those stable ids.

## Constraints

- The backend state surface must not write `.vault` documents, git state, or
  graph semantics. It may only hold bounded dashboard session state.
- Every response and validation error must use the shared API envelope and carry
  the tiers block.
- Selection lists, filter values, graph bounds, and date ranges must be bounded
  and validated at the route boundary.
- TanStack Query is the only frontend reader and mutation surface for shared
  dashboard state.
- Local React or Zustand state is permitted only for local chrome and per-frame
  scene or viewport state that is not shared across surfaces.
- The stale timeline `window` field, standalone salience lens store, local
  edited-window date writer, and unfiltered availability graph query must be
  removed rather than preserved as compatibility layers.
- Tests must exercise real code paths and must not use fakes, mocks, stubs,
  monkeypatches, skips, or xfails as shortcuts.

## Implementation

Add a bounded dashboard-state API surface to the backend. The state snapshot
contains the shared dashboard intent: scope, selection, hover, filters, date
range, timeline mode, graph granularity, salience lens and focus,
representation mode, panel state, and graph bounds. The route serves the current
snapshot and applies patch-style updates. It validates stable ids, date range
ordering, selected-id count, and known enum values before accepting a patch.

Add frontend wire types, adapters, query keys, query hook, mutation helpers, and
selector helpers under the stores server layer. The query hook is the only
reader of the dashboard-state snapshot. Mutation helpers are the only writer
surface for shared intents. Selector helpers derive graph query variables from
the canonical snapshot so the stage no longer rebuilds a partial filter by hand.

Burn down legacy stores and local writers in phases. Filters become pure
compilation helpers over canonical state. Date range writes go through the
dashboard-state mutation. Salience lens and focus move out of the standalone
store. Selection and hover bindings emit canonical mutations. Timeline callers
stop reading or writing the legacy `window` field and use scroll-strip viewport
state plus canonical date range and timeline mode.

Rewire the views as subscribers. The graph stage, left panel, right panel,
timeline controls, graph controls, and scene bridge read from the canonical
state and emit typed mutations. The availability query is derived from the held
canonical graph slice or uses the exact same query identity.

## Rationale

The dashboard needs one authoritative state model because its main surfaces are
not independent widgets. A filter, date range, selection, or lens choice changes
the graph, timeline, panels, and scene at the same time. Keeping these values in
local component state or separate stores creates a correctness problem, not just
an ergonomics problem.

Backend-backed TanStack state matches the rest of the dashboard data plane:
bounded API reads, typed wire shapes, explicit query keys, and subscriber-style
views. It also gives the campaign one place to validate patch intent, one place
to derive graph query variables, and one cache identity to audit.

## Consequences

This centralization makes cross-view sync testable and removes a class of
split-brain bugs. It should also reduce duplicate graph requests because query
identity is derived once instead of rebuilt by each caller.

The cost is a broad migration. The work touches backend routes, frontend stores,
graph stage, timeline, left panel, right rail, scene binding, and tests. During
execution there must be no long-lived bridge layer that keeps the old stores as
shadow authorities. Short migration helpers are acceptable only while a step is
in progress and must be removed before the relevant phase closes.

The backend session-state surface introduces a new API responsibility. It must
stay bounded, transient, and separate from vault content. If future work makes
dashboard state persistent, that will require a new ADR.

## Codification candidates

- **Rule slug:** `dashboard-shared-state-is-backend-tanstack`.
  **Rule:** Shared dashboard state that affects more than one surface must be
  read and modified through the backend-backed TanStack dashboard-state surface,
  not local component state or ad hoc view stores.
