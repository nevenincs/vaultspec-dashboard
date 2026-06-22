---
tags:
  - '#research'
  - '#graph-filter-fetch-split'
date: '2026-06-22'
modified: '2026-06-22'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace graph-filter-fetch-split with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `graph-filter-fetch-split` research: `Optimal graph-filter data flow: backend payload bound vs client within-set narrowing`

Grounded in a live rag-driven audit of the graph filter path (engine + stores), in
response to a directive to "drive backend-side filtering — do not serve information
we will never consume — but never completely re-query all data just because we
filter." The audit reconciles two goals that are in tension and finds the optimal
split between what the engine filters (to bound the wire) and what the client
narrows (to avoid a re-query).

## Findings

### F1 — The main graph slice is ALREADY backend-filtered (no over-serving there)

The premise that filtering is client-side is mostly false for the primary surface.
The frontend builds the query filter from the WHOLE canonical filter state
(`dashboardGraphFilter` = `cloneDashboardFilters(state.filters)` + `date_range` in
`frontend/src/stores/server/dashboardState.ts`) and SENDS it on the wire:
`useGraphSlice` → `engineClient.graphQuery({ …, filter })` → `POST /graph/query`
(`frontend/src/stores/server/queries.ts`, `engine.ts`). The query key includes the
filter, so a facet change re-queries a newly reduced slice. The engine applies every
rail facet server-side in `filter.rs::matches_node` (kinds, feature_tags,
feature_query, doc_types, statuses, plan_tiers, text, date_range; its own comment
calls this "a SERVER-side narrowing" of the rail category chips), and edges filter in
`graph_query` (tiers/confidence/relation/structural-state/health), self-consistently.
So the rail Filters + feature search already serve only matching nodes/edges.

### F2 — But the cache RE-QUERIES and BLANKS on every filter change

`useGraphSlice`'s `useQuery` carries only `queryKey`/`queryFn`/`enabled` — NO
`placeholderData`/`keepPreviousData`. So each new filter combination is a fresh
backend round-trip that blanks the prior data until it returns. `keepPreviousData` is
already imported in `queries.ts` but unused on this query. The timeline lineage query
is the in-repo counter-pattern: it "holds its dataset in memory and windows it
client-side, refetching ONLY on a bespoke signal." This is the optimal shape the
graph slice lacks.

### F3 — Both LODs are already payload-bounded

Feature granularity (the default constellation LOD) is bounded by feature count
(small). Document granularity is capped at `MAX_DOCUMENT_NODES` (5000) with a
self-consistent kept-edge subgraph and a `truncated` block
(`2026-06-13-graph-scale-hardening`). So a backend fetch is never "all data" — it is
already a bounded set; facets reduce it further.

### F4 — The genuine residual over-serving is narrow

- Neighbor / working-set ego expansions: `/nodes/{id}/neighbors` (`NeighborParams`
  in `engine/crates/vaultspec-api/src/routes/query.rs`) takes only scope/depth/
  tiers/lens — it DROPS the active facet filter, so an expansion fetches the
  unfiltered ego and the client masks it. Bounded (depth ≤ 4, GUI expands 1 hop), so
  small per call.
- The legend category-visibility mask (`hiddenCategories`, `graphCategoryVisibility`)
  is a deliberate client-only transient toggle, never written to `state.filters`.

### F5 — The fundamental tension (the crux)

The two goals are in tension per facet:

- Backend-filter a facet → limited wire payload, BUT a re-query on every change.
- Client-narrow a facet → no re-query, BUT the wire carries the un-narrowed superset.

You cannot have both for the SAME facet. The resolution is to classify EACH facet by
which cost dominates — payload impact vs re-query cost — not to blanket-thread the
filter (which would re-query egos + the whole slice on every toggle) nor to
blanket-client-narrow (which would re-introduce over-serving).

> UPDATE (during ADR): F6's client-narrow split was REJECTED on a correctness gate
> the deeper read of `graph_query_inner` surfaced — at feature granularity the engine
> aggregates FILTERED member documents into convergence nodes and serves only those,
> so the client cannot replicate a doc-type/status/text narrow (it has no member docs);
> and at document granularity the node ceiling truncates before any client narrow.
> Node/edge/text facets therefore stay engine-side; the adopted optimization is D1
> (`keepPreviousData`) plus the existing bounded cache. See the ADR.

### F6 — Optimal split (initial hypothesis, later rejected — see ADR)

- Tier 1 — backend, in the query key (payload-BOUNDING params): scope, granularity,
  lens, asOf, focus, feature descent (feature_tags), date_range — the params that
  meaningfully shrink the wire. They stay in the query AND gain
  `placeholderData: keepPreviousData` so a change never blanks and a seen filter is
  cache-instant.
- Tier 2 — client narrowing, NOT in the query key (cheap WITHIN-set facets): the
  status/health/text/tier/relation/structural-state toggles that only trim an
  already-bounded set. They narrow client-side through the EXISTING visibility
  membership (`computeVisibility`) + the reflow path — instant, no re-query.
- Neighbor egos and the legend mask stay client-narrow (their re-query cost
  outweighs the tiny payload saving), contradicting a literal "filter everything in
  the backend" reading on optimality grounds.

This honors both goals: every backend fetch is bounded (LOD + scope + heavy
reducers), and cheap filtering never triggers a re-query.

## Open questions for the ADR

- The exact Tier-1 vs Tier-2 facet boundary (edge filters reduce numerous edges, so
  tiers/relations may belong in Tier 1 at document granularity).
- Whether the Tier-1/Tier-2 boundary should differ by granularity (feature vs
  document), since doc-level facets do not reduce the feature constellation at all.
