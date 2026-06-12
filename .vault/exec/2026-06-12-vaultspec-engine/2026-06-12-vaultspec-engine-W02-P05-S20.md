---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S20'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement edge ingestion enforcing mandatory tier and provenance fields and the fixed per-tier confidence bands

## Scope

- `engine/crates/engine-graph/src/edges.rs`

## Description

- Implement edge ingestion enforcing the fixed per-tier confidence bands at the graph boundary: declared exactly 1.0 (core-derived exactly 0.8), structural 0.9/0.5/0.0 by resolution state (state mandatory, broken retained at floor confidence), temporal 0.3-0.9, semantic rejected outright (ephemeral by D3.5 - never graph fact).
- Implement same-id re-observation merge: multiplicity aggregates, freshest observation wins.

## Outcome

No malformed edge can enter the graph; every band and invariant covered by tests.

## Notes

Two carried review decisions land here explicitly: audit W01P01-003 - structural/declared multiplicity IS tracked, as an aggregated observation count on `EdgeAttrs` (same-id ingestion increments it); audit W01P03-103 - core's derived weight IS carried, on `EdgeAttrs.weight`, preserved through ingestion. Also: broken-state confidence fixed at 0.0 (the ADR names no number for broken, only 'retained-but-flagged'); flagged for phase review.
