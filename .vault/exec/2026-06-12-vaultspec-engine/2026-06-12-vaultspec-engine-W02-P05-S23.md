---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S23'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement feature-level meta-edge aggregation with count and per-tier breakdown per contract section 4

## Scope

- `engine/crates/engine-graph/src/project.rs`

## Description

- Implement feature-level meta-edge aggregation: document-level edges whose endpoints carry different feature tags aggregate into (src-feature, dst-feature) meta-edges with count and per-tier breakdown.
- Intra-feature edges produce no meta-edge (interior structure arrives on descent).

## Outcome

Contract section 4 constellation granularity: the GUI never flattens doc-level edges client-side; the engine serves the aggregation.

## Notes

Direction is preserved (a->b and b->a aggregate separately), matching the typed-directed-edge posture.
