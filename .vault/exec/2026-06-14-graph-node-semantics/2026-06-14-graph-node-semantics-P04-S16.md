---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# project edges as values carrying a derivation field distinct from relation

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

## Outcome

Changed `GraphSlice.edges` to serialized Values and added `edge_view` carrying the additive `derivation` field distinct from the section-4 relation; updated the route's bound_slice to read ids off the value.

{OUTLINE}

## Notes
