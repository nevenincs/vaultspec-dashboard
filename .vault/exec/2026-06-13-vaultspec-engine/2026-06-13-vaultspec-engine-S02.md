---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-12'
step_id: 'S02'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---




# Synthesize feature nodes (kind feature, id from feature tag, lifecycle and facet projections) at feature granularity and address meta-edges between their node ids

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Add `feature_nodes`: group the already-filtered document nodes by feature tag
  and synthesize one `kind=feature` node per tag (`id = feature:{tag}` via
  `NodeId::derive`), aggregating member progress into lifecycle and member
  per-tier degrees into `degree_by_tier`, with `member_count` and an existence
  facet in the queried scope.
- Return synthesized feature nodes at `Feature` granularity (previously an empty
  node list) while keeping the engine-aggregated meta-edges.
- Confirm meta-edges address feature NODE ids (`feature:...`), not bare tags.

## Outcome

Feature granularity returns the convergence entity itself, closing the ADR D4.1
gap. Conformance divergence 2 is green: non-empty feature nodes, member_count at
least 2, the degree projection present, and meta-edges addressing feature node
ids on both ends.

## Notes

Synthesis derives entirely from the filtered member set, so feature nodes honor
the same scope and filter as the document slice. The feature node id composition
(`NodeId::derive(Feature, tag)`) is identical to `node_id(CanonicalKey::Feature)`
- no new identity-bearing key form was introduced.

