---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Replace quadratic coreness peeling

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

- Replace repeated minimum-degree scans in `coreness` with the Batagelj-Zaversnik bucket
  peeling algorithm.
- Preserve the existing unweighted backbone degree semantics and return shape.
- Keep the implementation local to `engine-query` salience basis construction.

## Outcome

`coreness` now runs with bucketed degree updates instead of an O(V^2) repeated scan.
The existing pendant-leaf test passed after the change.

## Notes

Verification: `cargo test -p engine-query coreness --lib`.
