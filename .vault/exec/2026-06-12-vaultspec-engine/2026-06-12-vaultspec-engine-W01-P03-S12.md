---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S12'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the graph v2 payload parser producing declared edges preserving kind, multiplicity and weight, with core-derived edges as a distinct relation at 0.8 confidence

## Scope

- `engine/crates/ingest-core/src/graph_v2.rs`

## Description

- Implement the graph v2 payload parser: documents, declared edges (kind, multiplicity, weight preserved verbatim on `DeclaredEdge`), and core's `derived_edges` as the distinct core-derived relation at 0.8 confidence - never mixed into declared.
- Derive stable edge ids whose provenance key is per logical edge (source, target, kind), not per payload: re-ingestion of a changed payload keeps ids stable (contract section 2), proven by test.
- Map core kind strings onto the engine relation vocabulary with `references` as the authored-link fallback.

## Outcome

Declared-tier ingestion per ADR section 3: confidence 1.0, tier and provenance mandatory, payload hash recorded in provenance for auditability.

## Notes

The ADR's 'kind/multiplicity/weight preserved' lands on the `DeclaredEdge` wrapper (model `Edge` has no such fields); whether the W02 graph stores them on edges or as projections is W02.P05's call - noted there, no schema change made here.
