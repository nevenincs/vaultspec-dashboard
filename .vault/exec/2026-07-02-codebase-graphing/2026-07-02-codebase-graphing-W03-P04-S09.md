---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S09'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Implement the code-corpus query projections: module-rollup meta-edge aggregation, file-granularity slice with endpoint pruning, dir-prefix and language narrowing, and the per-corpus filter vocabulary

## Scope

- `engine/crates/engine-query/src/code.rs`

## Description

Implement rollup meta-edge aggregation (unordered module pairs, multiplicity-weighted, tier breakdown — the constellation shape verbatim), file-granularity slice with endpoint pruning, dir-prefix/language narrowing, member counts, language annotation, and the code facet vocabulary.

## Outcome

4 projection tests green; served node/edge values ride the shared node_view/edge_view projections for wire conformance.

## Notes
