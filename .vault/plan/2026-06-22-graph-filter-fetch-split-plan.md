---
tags:
  - '#plan'
  - '#graph-filter-fetch-split'
date: '2026-06-22'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-22-graph-filter-fetch-split-adr]]'
  - '[[2026-06-22-graph-filter-fetch-split-research]]'
---
# `graph-filter-fetch-split` plan

### Phase `P01` - Smooth, cache-first graph-slice fetch (D1)

The graph-slice query shows the prior bounded slice while a Tier-1 change loads, so filtering never blanks and a previously-seen filter is cache-instant.

Make graph filtering smooth and stop wasted re-queries without serving un-consumed data, per the accepted two-tier-filter ADR.

- [x] `P01.S01` - Add placeholderData keepPreviousData to the graph-slice useQuery (and its salience sibling delegate); `frontend/src/stores/server/queries.ts`.

### Phase `P02` - Keep node facets engine-side; pin the correctness gate (D2 rejected)

The feature-aggregation and node-ceiling gates make node/edge/text facets un-client-narrowable, so dashboardGraphFilter keeps forwarding them to the engine; a documenting comment and a test pin the invariant so no future agent re-introduces the hazard.

- [x] `P02.S02` - Document in dashboardGraphFilter why node, edge, and text facets stay engine-side (feature-aggregation and node-ceiling correctness gates); `no behaviour change; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P02.S03` - Add a stores test pinning that dashboardGraphFilter forwards every node, edge, and text facet into the query filter at both feature and document granularity; `frontend/src/stores/server/dashboardState.test.ts`.

### Phase `P03` - Confirm client narrowing, neighbors, legend; verify (D3/D4)

Tier-2 narrowing reuses the existing client membership unchanged; neighbor egos and the legend stay client-narrow; the whole path is gated and live-verified.

- [x] `P03.S04` - Add a stores test asserting the graph cache key is filter-sensitive (a filter change is a distinct entry, an identical filter reuses the entry) so the engine re-queries the limited set and a repeat is cache-instant; `frontend/src/stores/server/queries.test.ts`.
- [x] `P03.S05` - Run the frontend gate and affected vitest, then headless-verify that a filter change keeps the prior slice (no blank) and document-LOD fetches stay bounded; `frontend/src/stores/server`.

## Description

Grounds out the accepted two-tier-filter ADR (and its rag-driven research). The
engine already filters the main slice and both LODs are payload-bounded, so this work
does NOT add engine filtering. It removes the two real defects: the slice query blanks
and re-fetches on every filter change, and feature-LOD node-facet toggles re-query for
zero payload reduction. `D1` gives the query `keepPreviousData` so a refetch never
blanks and a seen filter is cache-instant. `D2` splits the query-filter builder so the
engine receives only payload-bounding Tier-1 facets, granularity-aware: node-reducing
facets stay server-side at document granularity (the `MAX_DOCUMENT_NODES` ceiling gate)
and are omitted at feature granularity, where the existing client visibility membership
narrows them with no re-query. `D4`: neighbor egos and the legend mask stay
client-narrow.

## Steps

## Parallelization

P01 is independent and lands first as a pure win (no behaviour change to what the
backend serves). P02 is the core change and shares no interdependency with P01, so the
two Phases may proceed in parallel. Within P02, S02 precedes S03 (the test pins the
split S02 introduces). P03 depends on P02 landing: S04 asserts the no-re-query
behaviour S02 enables, and S05 (gate + live verify) runs last.

## Verification

- `placeholderData: keepPreviousData` is set on the graph-slice query; a filter change
  no longer blanks the prior data (asserted in a stores test or confirmed live).
- `dashboardGraphFilter` omits the node-reducing facets from the query at feature
  granularity and includes them at document granularity; a unit test pins the boundary
  AND the ceiling-correctness gate (document granularity ALWAYS sends the node facets).
- A feature-granularity node-facet toggle produces an UNCHANGED graph query key (no
  re-query) while the client visibility membership still narrows the served slice; a
  unit test asserts both halves.
- The frontend gate (`just dev lint frontend`) is exit 0 on the touched files and the
  affected vitest suites pass; a headless run confirms a feature-LOD facet toggle
  issues no new `/graph/query` and document-LOD fetches stay bounded.
- The plan is complete when every Step is closed (`- [x]`).
