---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S26'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement incremental re-index with content-hash skip against the store cache

## Scope

- `engine/crates/engine-graph/src/index.rs`

## Description

- Implement content-hash incremental re-index: extraction results cache under (extract, blob-oid) in the store; unchanged blobs skip extraction entirely.
- Resolution always recomputes against the current tree - resolution state is live signal, not cacheable fact.
- `IndexStats` reports documents/cache-hits/extracted/edges so skip behavior is observable.

## Outcome

Warm re-index is skip-heavy and deterministic (D2.4): the re-derivability test shows a warm run with 100% cache hits producing identical node and edge ids.

## Notes

Review carry W01P04-104 (memoize file reads inside resolve) remains open - resolution rescans per mention; acceptable at current corpus sizes, flagged again for the phase review rather than silently grown.
