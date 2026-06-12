---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S03'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement stable EdgeId content-hash derivation over src, dst, relation, tier and provenance key with determinism unit tests

## Scope

- `engine/crates/engine-model/src/id.rs`

## Description

- Implement `edge_id` as a content hash over src, dst, relation wire name, tier wire name, and the provenance stable key.
- Implement `Provenance::stable_key` excluding volatile inputs (core payload hash, blob hash, byte spans, rag rank and score) so re-derivation of the same logical edge yields the same id.
- Implement FNV-1a 128-bit in-crate (deterministic across platforms and Rust versions, unlike the std hasher) with known-vector tests.
- Unit-test determinism, volatile-field independence, and sensitivity to every identity component including direction.

## Outcome

Stable edge identity per contract section 2. Hash is dependency-free; collision budget documented in code (non-adversarial, vault-scale).

## Notes

Design call worth review: the provenance *stable key* (not the full provenance struct) participates in the hash, otherwise every re-ingestion would mint new edge ids and break GUI animate-by-id. This reads as the contract's intent ('provenance key', re-derivation clause) rather than a deviation; flagging for the phase review to confirm.
