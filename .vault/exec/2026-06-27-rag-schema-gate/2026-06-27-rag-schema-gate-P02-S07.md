---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Added stage 2: only when rag advertised a contract (`schema_version.is_some()`) the handler reads `/readiness` over the service port (`control::readiness`), extracts the facts, and applies `storage_schema_supported`, degrading through the closure on a dense-name or dimension mismatch.
- A `/readiness` read failure degrades (fail closed) with the transport reason stated, since the shape cannot be validated before the direct read.

## Outcome

The dense vector name and effective dimension are validated against the engine's pins before the scroll; a pre-contract rag (`None`) skips the descriptor read entirely (additive, no regression, zero extra round-trips).

## Notes

The `vaultspec-api` crate builds clean; the gate composition is covered by the S08 test and the rag-client unit tests.
