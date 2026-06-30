---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S03'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Added the `StorageSchemaFacts` struct (version, dense_name, dense_dim - all `Option`) with an `advertises_contract()` helper distinguishing a pre-contract rag from a contract-advertising one.
- Implemented `extract_storage_schema_facts(&Value)` pulling `schema.version` and `schema.vault.vectors.dense.{name,dim}` from the `/readiness` descriptor tolerantly (a missing/mistyped field is `None`).

## Outcome

The engine can read rag's advertised descriptor without hard-parsing - every field is optional, an absent field resolved by the gate rather than a panic.

## Notes

`advertises_contract()` is what keeps the gate additive for an older rag (no schema block → no contract → no degrade).
