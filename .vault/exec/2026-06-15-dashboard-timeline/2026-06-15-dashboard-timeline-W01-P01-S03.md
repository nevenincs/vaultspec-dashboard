---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Collect edges among the kept nodes from the shipped relation and tier edges with a graceful fallback when the derivation field is absent

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Added `lineage_arc`, projecting a stored edge into a `LineageArc` carrying the stable edge id, src, dst, relation wire name, tier wire name, and confidence.
- Collected edges from the shipped relation/tier edges in scope that pass the filter, built once the kept node set is known so the arc set stays self-consistent.
- Implemented the graceful derivation fallback: the shipped `engine_model::Edge` carries no `derivation` field yet, so the arc's `derivation` is `None` and the projection draws real lineage from the shipped relation/tier truth; `lineage_arc` is the single seam that will read the field when the node-semantics campaign lands it.

## Outcome

Edges among the kept nodes are returned as arcs with their real relation, tier, and confidence, and a `None` derivation that serializes away until the field ships. Verified by `arcs_carry_relation_tier_confidence_and_a_graceful_derivation_fallback`.

## Notes

Confirmed by grep that no `derivation` field exists on `Edge` in `engine-model` today, matching the ADR's parent-feature-stability constraint; the fallback is the mitigation that keeps the build off the node-semantics critical path.
