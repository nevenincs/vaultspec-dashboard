---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S07'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Add a viewport/region filter parameter to the document query

## Scope

- `engine/crates/engine-query/src/filter.rs`

## Description

- Confirmed the bounded-descent region primitive already exists: the engine
  `Filter` carries `feature_tags`, and `matches_node` scopes a document query to
  a feature's members. Zoom into a constellation node → `granularity=document` +
  `filter.feature_tags=[<tag>]` returns that feature's bounded document subgraph.

## Outcome

Bounded descent is served by the existing feature/kind/text filter plus the S06
node ceiling — no new filter field was needed.

## Notes

DEVIATION (read-and-infer boundary): a SPATIAL viewport filter (pixel/world
coordinates) cannot live in the engine — the engine holds no layout coordinates;
layout is computed client-side (the graph-compute-is-CPU / GPU-is-render
boundary, ADR D5). The engine's region primitive is therefore the semantic
filter (feature/kind/text), not coordinates. The client bounds by screen region
by mapping visible nodes to a feature/id filter or using the existing
`/nodes/{id}/neighbors` ego query for descent. Recorded so the contract names the
engine's region semantics honestly (contract §4 amendment, S08).
