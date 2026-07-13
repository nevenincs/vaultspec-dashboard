---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S17'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Gate the embeddings direct-Qdrant scroll behind a health capability and Qdrant-version check, degrading the embedding tier honestly

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Upgrade the embeddings path's `discover()` to the running-predicate `probe_machine_state` (discover + heartbeat + /health): the direct scroll now requires a RUNNING rag (a fresh-heartbeat-but-dead service is honest absence, not a doomed scroll), and /health yields the Qdrant version.
- Add the D6 capability gate: refuse the direct Qdrant scroll when `qdrant_collection_api_supported(version)` is false (unknown Qdrant major / no version), degrading the semantic tier honestly with the version STATED rather than scrolling a shape the engine may misread.
- Factor a `degraded_embeddings(reason)` closure so the rag-down, crashed/absent, and capability-gate degraded envelopes share one shape.

## Outcome

Done. The embeddings direct-Qdrant read (the D6 unversioned second contract) is now capability/version-gated and fails closed on an unrecognized Qdrant, consistent with the Tier-2 collection-health gate. `cargo build -p vaultspec-api` and `cargo test -p vaultspec-api --lib` (130 passed) are green. Executed out of strict wave order, sanctioned by the plan's parallelization note (W05.P10 is independent of the console).

## Notes

Switching to `probe_machine_state` adds one localhost `/health` round-trip on the embeddings path but makes it stricter-correct (a not-ready service degrades cleanly instead of attempting a scroll that would fail), and reuses the W01 predicate. The scroll's own shape-drift tolerance (dense-vector miss -> honest absence) still backstops within a supported Qdrant major.
