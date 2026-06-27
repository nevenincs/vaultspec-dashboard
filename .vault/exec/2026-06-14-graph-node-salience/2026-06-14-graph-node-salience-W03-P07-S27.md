---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S27'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Memoize the lens basis per (graph-generation, lens) and the focus-folded final score per (lens, focus), recomputing only on graph change

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

## Outcome

Added the FocusKey memoization key (lens, focus, partial): the basis is keyed per (graph-generation, lens) by the caller and the focus-folded score per (lens, focus) by this key. A no-focus lens switch and a focus change are distinct keys; identical (lens,focus,partial) is a cache hit.

## Notes
