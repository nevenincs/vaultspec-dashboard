---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S40'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement rag search forwarding with engine node-id annotation on each result

## Scope

- `engine/crates/rag-client/src/search.rs`

## Description

- Implement search forwarding: the request body and rag's response envelope transit VERBATIM (unknown envelope fields pass through untouched - tested); the engine's only addition is per-result node-id annotation (vault stems to document nodes, paths to code-artifact nodes, null for sourceless hits).
- Implement degradation-reason mapping from transport failures for the contract section 2 tier block.

## Outcome

Contract section 8 / D5.2: no search semantics in the engine; results click through into the graph via the annotation.

## Notes

None.
