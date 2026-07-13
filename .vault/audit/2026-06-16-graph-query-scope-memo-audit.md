---
tags:
  - '#audit'
  - '#graph-query-scope-memo'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-graph-query-scope-memo-plan]]"
---

# `graph-query-scope-memo` audit: `scope-node memoization review`

## Scope

Backend-implementation-campaign wave 3 (research backend-hotpath-hardening F4):
memoizing the `/graph/query` Document arm's per-request in-scope node scan.
Reviewed independently; engine gate green.

## Findings

### Verdict: PASS (no Critical/High/Medium, no nits)

`graph_query_inner` rebuilt `scope_nodes` (a full `graph.nodes()` scan filtered by
scope facet) on every Document request, only for the broken-link endpoint check.
The fix folds the in-scope node-id set into the EXISTING per-generation
`build_document_views` (cached in `ScopeCell::doc_views_cache`) at zero added
build cost — computed in the same single node pass that builds `node_views` — and
threads it through `graph_query_cached`/`graph_query_inner` so the Document arm
reuses it instead of rescanning. The uncached `graph_query` path still builds the
set inline. The reviewer verified:

- **Equivalence:** identical predicate and node universe; `HashSet<String>::
  contains(&str)` (Borrow) matches the old `HashSet<&str>` lookup; the uncached
  fallback is equivalent. The pre-existing `cached document slice diverged from
  uncached` parity test (byte-identical across filters) is the strongest possible
  guard and passes.
- **Cache correctness:** the set is a pure function of (generation, cell scope);
  it rides the generation-keyed cache (invalidated on bump), cannot go stale
  within a generation, and adds zero scans (folded into the existing loop).
- **`matched` untouched** (correctly filter-dependent); no filtering/sorting/
  bounding change.
- **Rules:** `engine-read-and-infer`, `bounded-by-default`, `graph-compute-is-cpu`
  all satisfied.

Net: one of the two per-request full node scans on the critical `/graph/query`
Document path is eliminated.

## Recommendations

- **Remaining campaign backlog (low priority):** F5 (`filter.rs` const-array
  `.iter().any()` micro-opt over ~4-element arrays) and F6 (stream reducer ring
  buffer vs the per-chunk 256-array slice) are marginal — both operate on
  already-bounded tiny structures. Candidates to decline with rationale unless a
  profile shows them hot.

## Codification candidates
