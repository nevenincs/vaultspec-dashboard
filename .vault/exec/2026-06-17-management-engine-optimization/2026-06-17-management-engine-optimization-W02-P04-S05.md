---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S05'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Add generation keyed document query indexes

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Replace the loose document-view tuple with a `DocumentViews` generation cache.
- Add sorted candidate indexes for in-scope document ids by kind, doc type, feature
  tag, status, and plan tier.
- Add sorted candidate indexes for scope edge ids by relation and tier.
- Start cached document queries from indexed candidate ids, then run the normal filter
  matcher as the correctness floor.

## Outcome

Document queries no longer have to begin every filtered request by scanning all in-scope
nodes and all scope edges. The cached path narrows the candidate id set first and keeps
the uncached path as a pure fallback. Existing cached/uncached equality coverage was
extended to an indexed feature-tag filter.

## Notes

Verification:

- `cargo test -p engine-query cached_document_query_is_byte_identical_to_uncached --lib`
- `cargo test -p engine-query --lib`
- `cargo test -p engine-query --test query_hotpaths -- --nocapture`
