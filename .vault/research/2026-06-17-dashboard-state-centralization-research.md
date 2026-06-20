---
tags:
  - '#research'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
related: []
---

# `dashboard-state-centralization` research: `Dashboard state centralization`

This research grounds the campaign to centralize shared dashboard state across
the left panel, right panel, timeline, graph, scene bridge, filters, selection,
salience, and date range. Discovery used `vaultspec-rag` semantic search first,
then exact source reads and a read-only `gpt-5.5` high subagent audit. No code
was changed during research.

## Findings

The existing architectural intent is already consistent: server data belongs in
TanStack Query, shared cross-surface view identity belongs behind a single store
contract, and per-frame scene state stays behind the scene controller. The
frontend-state reference and earlier dashboard ADRs already warn against raw
view-local fetches, duplicated filters, and independent scene state.

The live code has drifted from that intent. `viewStore` owns some shared state
such as selection, timeline mode, graph granularity, active lens, representation
mode, and recent graph-bound controls. `filters` owns current filter values and
compiles them into graph filters. `Timeline` owns local scroll-strip state, but
also still exposes a legacy `window` field. A separate `salienceLens` store owns
another lens and focus value used by older query helpers. These overlaps create
multiple authorities for the same product concepts.

Date range is the clearest split-brain. The filter model says `dateRange` is the
single product date filter, and the timeline range selector was intended to be
the single writer. The stage filter sidebar also writes date range through an
edited-window preset. That makes it possible for timeline state, filter chips,
and graph query variables to diverge or to clear from different controls with
different local assumptions.

Salience is the second split-brain. Stage and salience controls read active lens
from `viewStore`, while server query helpers still import `salienceLens` for a
separate lens and focus pair. The system can therefore issue a graph request for
one lens while the UI presents another. The standalone store should be removed
after canonical lens and focus state exists.

The timeline `window` field is stale legacy state. Current rendering is driven
by scroll offset, pixel scale, and visible range. Keyboard navigation, event-menu
zoom, and salience timeline entry still read or write the old `window` shape.
Those callers should move to scroll-strip viewport state plus canonical date
range and canonical timeline mode.

The graph stage duplicates query identity. The held graph slice is fetched with
the active filter and lens, while availability performs a second graph slice
with an unfiltered identity. Availability should come from the canonical held
slice or from an explicitly identical query key so filter and lens changes do
not create redundant backend reads.

The backend can own shared dashboard state without violating the engine
read-and-infer rule if the surface is a bounded session-state API and never
writes vault content or mints graph semantics. That route should carry the same
envelope and tiers discipline as other dashboard routes. TanStack Query should
then become the sole frontend read and mutation surface for shared dashboard
state. Local React or Zustand state can remain only for local chrome and
per-frame scene details that are not cross-surface product state.

The campaign must treat tests as real-behavior checks. The project instruction
forbids fakes, mocks, stubs, monkeypatches, skips, and xfails as shortcuts. The
test plan therefore needs route tests against the real API code paths, frontend
stores tests through the real engine client path, browser integration checks for
cross-view propagation, and request-count checks proving duplicate graph queries
were removed.
