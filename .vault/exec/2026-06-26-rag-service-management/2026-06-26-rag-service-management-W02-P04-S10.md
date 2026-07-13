---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Serve the rag-ops state through a new engine route via the shared envelope and tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Add `ops-state` and `storage-survey` to `RAG_READ_VERBS` (the brokered GET surface) with a `MAX_RAG_SURVEY_LIMIT` (256) bound.
- Dispatch `ops-state` -> `control::fetch_rag_ops_state` (serialized to Value) and `storage-survey` -> `control::storage_survey` with a bounded limit, both wrapped by the existing `brokered_envelope` (verbatim under `data.envelope` + tiers block; a down rag degrades the semantic tier, never a 5xx).

## Outcome

Done. The engine serves `GET /ops/rag/ops-state` (one Rust-aggregated size/state snapshot) and `GET /ops/rag/storage-survey` (raw orphan/size detail) through the same shared-envelope/tiers path as every other brokered read. `cargo build -p vaultspec-api` is green.

## Notes

Reused the existing `brokered_envelope` so the tiers truth and degraded-on-down behavior are identical to the other reads (no new envelope path). The aggregation's own survey limit (64) is independent of the raw verb's 256 cap.
