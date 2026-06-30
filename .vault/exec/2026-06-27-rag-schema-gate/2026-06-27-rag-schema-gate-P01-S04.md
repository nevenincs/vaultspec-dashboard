---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Implemented `storage_schema_version_supported(Option<u64>)`: the cheap version rule - `None`/equal/older compatible, strictly-newer a stated-reason degrade.
- Implemented `storage_schema_supported(&StorageSchemaFacts)`: a pre-contract rag (no contract advertised) passes additively; otherwise apply the version rule, require a dense vector named exactly `dense`, and require the effective dim to equal `EXPECTED_DENSE_DIM`, each mismatch returning a stated reason.

## Outcome

The engine has rag's compatibility recipe as a pure, typed gate: newer-version → degrade, dense-name-must-exist/match, dim-mismatch → hard refuse, with a pre-contract escape that prevents a regression against older rag.

## Notes

The full gate re-checks the version (defense in depth) so the descriptor's version is authoritative even if `/health` and `/readiness` ever disagreed.
