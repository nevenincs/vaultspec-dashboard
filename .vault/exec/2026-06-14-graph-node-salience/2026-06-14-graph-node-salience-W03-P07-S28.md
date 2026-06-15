---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S28'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Unit-test that a no-focus lens switch is a warm-cache hit and a focus change runs exactly one warm-started PPR pass

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description


## Outcome

Unit test that a no-focus lens switch keys differently (warm-cache re-query, not recompute) and a focus change is a distinct memo key (one warm-started fold). The route layer (W03.P08) memoizes the basis per generation and folds focus on demand behind these keys.

## Notes

