---
generated: true
tags:
  - '#index'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - '[[2026-06-12-vaultspec-engine-W01-P01-S01]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S02]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S03]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S04]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-S05]]'
  - '[[2026-06-12-vaultspec-engine-W01-P01-summary]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-06-12-vaultspec-engine-plan]]'
---

# `vaultspec-engine` feature index

Auto-generated index of all documents tagged with `#vaultspec-engine`.

## Documents

### adr

- `2026-06-12-vaultspec-engine-adr` - `vaultspec-engine` adr: `vaultspec engine architecture` | (**status:** `accepted`)

### exec

- `2026-06-12-vaultspec-engine-W01-P01-S01` - Define Node, NodeKind, Edge, RelationKind, Tier, Provenance and ScopeRef types per ADR section 3 as pure no-IO types
- `2026-06-12-vaultspec-engine-W01-P01-S02` - Implement stable NodeId derivation from kind plus canonical key (feature tag, vault stem, plan stem plus step id, commit sha, repo path plus symbol) with unit tests
- `2026-06-12-vaultspec-engine-W01-P01-S03` - Implement stable EdgeId content-hash derivation over src, dst, relation, tier and provenance key with determinism unit tests
- `2026-06-12-vaultspec-engine-W01-P01-S04` - Implement the SQLite schema for derived artifacts keyed by input content hash, the temporal event log, and the semantic TTL cache
- `2026-06-12-vaultspec-engine-W01-P01-S05` - Implement the store read and write API with single-writer discipline and concurrent-reader tests
- `2026-06-12-vaultspec-engine-W01-P01-summary` - `vaultspec-engine` `W01.P01` summary

### plan

- `2026-06-12-vaultspec-engine-plan` - `vaultspec-engine` plan
