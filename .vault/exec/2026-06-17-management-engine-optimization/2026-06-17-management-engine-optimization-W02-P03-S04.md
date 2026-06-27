---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S04'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Compile filter membership and text normalization

## Scope

- `engine/crates/engine-query/src/filter.rs`

## Description

- Add a sorted-vector membership helper for validated filter facets.
- Replace repeated linear relation, state, kind, doc-type, feature-tag, status, and
  plan-tier membership checks with binary search.
- Normalize the text needle once during filter validation instead of once per node.

## Outcome

Filter evaluation now uses the sorted/deduped invariant that validation already
establishes. The request path avoids repeated linear scans for common facets and avoids
per-node lowercasing of the search needle.

## Notes

Verification:

- `cargo test -p engine-query filter --lib`
- `cargo test -p engine-query --lib`
- `node node_modules/vitest/vitest.mjs run src/testing/engineConformance.test.ts src/stores/server/liveAdapters.salience.test.ts`
