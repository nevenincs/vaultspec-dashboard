---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S39'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement node-scoped semantic discovery queries with TTL cache, 0.7 confidence cap and ephemeral never-persisted edges

## Scope

- `engine/crates/rag-client/src/discover.rs`

## Description

- Implement node-scoped semantic discovery: query rag through the store's semantic TTL cache (5-minute default, at-most-one live call per window - proven by a transport-call-count test), producing CANDIDATE edges only.
- Enforce the 0.7 confidence cap (raw score preserved in RagMatch provenance for audit); ephemerality is type-enforced - the test proves `engine_graph::ingest` rejects a semantic edge outright.

## Outcome

D3.5 complete: semantic edges are ephemeral, lazy, TTL-cached, capped, labelled, and structurally incapable of becoming graph fact.

## Notes

None.
