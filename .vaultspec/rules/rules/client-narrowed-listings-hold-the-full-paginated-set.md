---
name: client-narrowed-listings-hold-the-full-paginated-set
---

# A client-side-narrowed listing must hold the complete paginated set

## Rule

When a `frontend/src/stores/` reader narrows a server LISTING on the CLIENT (a
facet/text filter applied in the browser over an already-fetched collection,
rather than forwarded to the engine), its wire client must hold the COMPLETE
listing — paginate the cursor to completion — never just the first page. A
client narrow over a partial first page is a defect: it silently drops every
match that lives beyond the page. The completion walk is itself bounded (a max
page count, each page at the route's page-size cap) so it never becomes an
unbounded accumulator.

## Why

This is the `node-facets-filter-on-the-engine` ceiling gate manifest in a list
surface: narrowing AFTER a server truncation drops matches the client never
received. Issue #6 hit it exactly — the left rail narrows the vault tree on the
client (`narrowVaultRailEntries` over `/vault-tree`), but `engineClient.vaultTree`
fetched only the DEFAULT first page (500 of 1214 documents, covering 35 of 104
features), while the feature-filter autocomplete offered all 104 features from
`/filters`. Selecting any feature whose documents sat beyond the first page
narrowed the loaded 500 to nothing — the rail showed "No documents match this
filter" for a feature that genuinely had documents. The same partiality also
silently hid 69 features from the unfiltered rail. The fix made `vaultTree` walk
the cursor to completion (page size = the route's sanctioned max, with a bounded
page cap per `bounded-by-default-for-every-accumulator`), so the client holds
the whole untruncated listing and every client narrow is correct. The cleanest
alternative is to forward the filter to the engine so the page is drawn from the
already-filtered set; either way the client must never narrow a partial page.

## How

- **Good:** a stores wire client for a list the UI narrows client-side walks
  `next_cursor` to completion and concatenates every page (bounded by a max page
  count), so `computeVisibility`/`narrow*` reductions run over the full set.
- **Good:** alternatively the reducing facet is forwarded to the engine and the
  (paginated) page is drawn from the FILTERED corpus — the engine is the single
  narrowing authority (`node-facets-filter-on-the-engine`).
- **Bad:** fetching only the first page (`GET /list` with the default page size,
  no cursor follow) and narrowing it client-side — a value the partial page does
  not contain narrows to nothing, and the surface lies "no matches" while matches
  exist on later pages. This is the exact Issue #6 failure.

## Status

Active. Promoted from the Issue #6 fix on the dashboard's left-rail feature
filter (the rail held only the first `/vault-tree` page, so selecting a feature
beyond it emptied the list), live-verified before/after at 1920×1080. Sibling of
`node-facets-filter-on-the-engine` (the engine ceiling gate this manifests),
`bounded-by-default-for-every-accumulator` (the completion walk is bounded),
`graph-queries-are-bounded-by-default`, and `dashboard-layer-ownership` (the
stores layer is the sole wire client that holds the listing).

## Source

Issue #6 live debugging and fix: `engineClient.vaultTree`
(`frontend/src/stores/server/engine.ts`) cursor-walk-to-completion over the
paginated `/vault-tree` route (default page 500, max 2000, `next_cursor`), with
the client-side `narrowVaultRailEntries` reduction running over the full set.
Grounding rule `node-facets-filter-on-the-engine` (feature-aggregation +
ceiling gates). Sibling rules `bounded-by-default-for-every-accumulator`,
`graph-queries-are-bounded-by-default`, `dashboard-layer-ownership`.
