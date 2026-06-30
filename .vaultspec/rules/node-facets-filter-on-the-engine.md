---
name: node-facets-filter-on-the-engine
---

# Graph node/edge/text filter facets are applied on the engine, never re-derived client-side

## Rule

Every graph filter facet that reduces the node, edge, or text-matched set -
`doc_types`, `statuses`, `plan_tiers`, `text`, `feature_tags`, `feature_query`,
`tiers`, `relations`, `structural_state`, `min_confidence`, `health`, `date_range`,
`kinds` - is applied on the ENGINE in the `/graph/query` filter (carried in the
`dashboardGraphFilter` payload and the TanStack query key), and is NEVER re-derived as
a client-side narrow of the already-served slice. The stores-layer visibility
membership (`computeVisibility`) narrows ONLY what the client can fully see: the
client-added nodes the engine query never produced (working-set ego expansions, pinned
discoveries) and the canvas-local legend category mask. Smoothness under filtering is
bought with the slice query's `placeholderData: keepPreviousData` plus the bounded
cache, NOT by moving filtering off the engine.

## Why

The `2026-06-22-graph-filter-fetch-split-adr` decision was prompted by a directive to
"drive backend-side filtering, never serve un-consumed data, but never completely
re-query all data". A rag-grounded audit found the backend already filters the slice
and tempted a "move cheap facets to a client narrow to avoid the re-query" split - which
reading `graph_query_inner` proved to be a silent-correctness hazard, blocked by two
gates. FEATURE-AGGREGATION GATE: at feature granularity the engine applies the facet to
the underlying DOCUMENTS, then aggregates the survivors into feature-convergence nodes
and serves only those (tag plus `member_count`); the client never receives the member
documents, so it cannot reproduce a `doc_type`/`status`/`text` narrow and would render
stale feature nodes (wrong members, wrong counts, wrong presence). CEILING GATE: at
document granularity the engine truncates to `MAX_DOCUMENT_NODES` BEFORE serialization,
so a client narrow acts AFTER truncation and silently drops matches beyond the ceiling.
Either gate alone makes a client re-derivation wrong; together they make the engine the
single correct narrowing authority.

## How

- **Good:** a new reducing facet is added to the engine `Filter` and forwarded by
  `dashboardGraphFilter` into the `/graph/query` payload (and thus the cache key); a
  filter change re-queries the LIMITED set, and `keepPreviousData` holds the prior
  bounded slice so the canvas never blanks while it loads.
- **Good:** the client membership narrows a working-set ego expansion or a legend
  category toggle - data the client fully holds (the served ego documents carry the
  facet fields; the legend is a kind/category the node already advertises) - so a client
  narrow there is correct and avoids a re-query of every opened ego.
- **Bad:** dropping `doc_types`/`statuses`/`text` from the query "to avoid a re-query"
  and re-applying it in `computeVisibility` over the served slice - at feature
  granularity it narrows aggregated convergence nodes whose members the client never
  saw (wrong result), and at document granularity it narrows after the node-ceiling
  truncation (silently missing matches).

## Status

Active. Promoted from the `2026-06-22-graph-filter-fetch-split-adr` codification
candidate at the close of the cycle that adopted `keepPreviousData` (D1) and rejected
the client-narrow split (D2) on these correctness gates. Sibling rules
`graph-queries-are-bounded-by-default` (the node ceiling this gate depends on),
`derived-projections-memoize-on-the-graph-generation`, and `dashboard-layer-ownership`
(the stores layer is the sole wire client that holds the filter).

## Source

ADR `2026-06-22-graph-filter-fetch-split-adr` and research
`2026-06-22-graph-filter-fetch-split-research` (findings F1, F5, and the
`graph_query_inner` feature-aggregation reading). Grounding: the engine
`filter.rs::matches_node` server-side facet narrowing, the `MAX_DOCUMENT_NODES` ceiling
(`2026-06-13-graph-scale-hardening`), and the `dashboardGraphFilter` / `engineKeys.graph`
stores seam.
