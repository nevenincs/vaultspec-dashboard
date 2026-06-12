---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S02'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---




# Implement stable NodeId derivation from kind plus canonical key (feature tag, vault stem, plan stem plus step id, commit sha, repo path plus symbol) with unit tests

## Scope

- `engine/crates/engine-model/src/id.rs`

## Description

- Add `CanonicalKey` covering all five identity key forms: feature tag, vault stem, plan stem plus container id, commit sha, repo path with optional symbol qualifier.
- Implement `node_id` deriving the stable `kind:key` form; retain `NodeId::derive` as the pre-rendered-key convenience.
- Unit-test every key form and derivation stability.

## Outcome

Stable node identity per contract section 2: never positional, never regenerated; identical input always yields a byte-identical id. Six-form coverage test plus stability test pass.

## Notes

Plan caption named the file `id.rs` for both S02 and S03; both landed in `engine/crates/engine-model/src/id.rs` as planned.
