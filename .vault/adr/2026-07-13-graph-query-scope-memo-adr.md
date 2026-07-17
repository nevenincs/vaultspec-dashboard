---
tags:
  - '#adr'
  - '#graph-query-scope-memo'
date: '2026-07-13'
modified: '2026-07-17'
related:
  - "[[2026-06-16-backend-hotpath-hardening-research]]"
  - "[[2026-06-16-graph-query-scope-memo-plan]]"
---

# `graph-query-scope-memo` adr: `compute scope_node_ids once per document-view build, thread through the cache` | (**status:** `accepted`)

## Problem Statement

RETROACTIVE RECORD: this decision was executed directly against the same grounding research
that drove `backend-hotpath-hardening` on 2026-06-16, as an immediate one-step follow-on
plan, without its own ADR checkpoint at the time; this document records it after the fact.

`graph_query_cached`/`graph_query_inner`'s Document branch recomputed `scope_node_ids` by
scanning all nodes on every call, even though the same scan is already performed once per
generation inside `build_document_views`. The result was a second, redundant full-node scan
sitting on the same request path the sibling `backend-hotpath-hardening` decision was
already hardening.

## Considerations

The `DocViews` cache tuple was the natural carrier: it is already generation-keyed, already
threaded through both `graph_query_cached` call sites, and already the object
`backend-hotpath-hardening` extended with a basename index for the same reason (reuse a
per-generation computation instead of repeating it per request).

## Considered options

- **Recompute `scope_node_ids` per request in the Document branch (status quo)** — an extra
  O(node count) scan on every graph query; rejected as redundant work already done once per
  generation elsewhere.
- **Compute `scope_node_ids` inside `build_document_views` and carry it on the `DocViews`
  cache tuple** — one computation per generation, reused at both `graph_query_cached` call
  sites. Chosen — mirrors the caching shape already accepted for the basename index.

## Constraints

Depends on `DocViews` staying the generation-keyed cache boundary; no new dependency.

## Implementation

Compute `scope_node_ids` inside `build_document_views` (one pass) and return it; extend the
`DocViews` cache tuple to carry the scope-node-id set; thread it through
`graph_query_cached`/`graph_query_inner` so the Document branch reuses the carried set
instead of rescanning. A cached-vs-uncached parity test guards that the memoized path
returns the same scope set as the original per-request scan.

## Rationale

Grounded in the same `backend-hotpath-hardening` research pass that identified the vault-doc
basename lookup as a redundant per-request scan; the scope-node-id computation was the
second instance of the identical pattern (recomputing per-generation-stable data per
request) surfaced by that research, executed as a direct, low-risk follow-on.

## Consequences

Removes a second O(node count) scan from the graph query hotpath at the cost of one more
field on the `DocViews` cache tuple. No known pitfalls; the parity test guards against the
memoized and unmemoized scope sets silently diverging.
