---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` `W02.P05` summary

Phase W02.P05 (graph and facets) is complete: all six Steps closed,
workspace checks green at the boundary. W02.P06/P07/P09 unblock; P08
additionally awaits P07.

- Created: `engine/crates/engine-graph/src/graph.rs`
- Created: `engine/crates/engine-graph/src/edges.rs`
- Created: `engine/crates/engine-graph/src/facets.rs`
- Created: `engine/crates/engine-graph/src/project.rs`
- Created: `engine/crates/engine-graph/src/context.rs`
- Modified: `engine/crates/engine-graph/src/lib.rs` (module rollup)
- Modified: `engine/crates/engine-model/src/lib.rs` (Facet lifecycle,
  Node feature_tags — additive, contract-backed)

## Description

Delivered the in-memory graph core. Nodes store by stable key with
replace-by-scope facet merge and feature-tag union — one node per key
across every corpus view, branch variance in facets (D4.2). Edge ingestion
enforces the fixed per-tier confidence bands at the boundary (declared 1.0
/ core-derived 0.8; structural 0.9/0.5/0.0 by mandatory resolution state
with broken retained at floor; temporal 0.3–0.9; semantic rejected outright
as ephemeral per D3.5), and same-id re-observations aggregate multiplicity
keeping the freshest observation. Facet reconciliation surfaces presence,
content, and lifecycle divergence as typed signal, never auto-merging.
Query-time projections serve per-tier degree counts and lifecycle
summaries; feature-level meta-edges aggregate cross-feature doc edges with
count and per-tier breakdown (contract section 4 constellation
granularity). Context assembly returns the tier-labelled bundle as a pure,
serializable, deterministic read — the orchestration seam (D4.4).

Review carries resolved in this phase, both recorded in the S20 record:
W01P01-003 (multiplicity explicitly tracked as an aggregated observation
count) and W01P03-103 (core's derived weight explicitly carried). One new
flag for review: broken-state confidence fixed at 0.0 (the ADR names no
number). Verification at the boundary: 63 workspace tests green, fmt and
clippy -D warnings clean.
