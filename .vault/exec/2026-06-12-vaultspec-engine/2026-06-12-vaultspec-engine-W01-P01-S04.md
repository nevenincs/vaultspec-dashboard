---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S04'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---




# Implement the SQLite schema for derived artifacts keyed by input content hash, the temporal event log, and the semantic TTL cache

## Scope

- `engine/crates/engine-store/src/lib.rs`

## Description

- Define schema v1 in `engine/crates/engine-store/src/lib.rs`: `derived_artifacts` keyed by (kind, input content hash), `temporal_events` with autoincrement monotonic seq plus ts index, `semantic_cache` with expiry timestamp.
- Track schema identity via `PRAGMA user_version`; create on 0, accept current, fail loud on unknown versions.
- Configure WAL journaling and NORMAL synchronous on open; database lives at the ADR D8.1 location under the vault data directory.

## Outcome

Schema applied on first open; version mismatch raises a typed error instead of guessing. All three table families covered by round-trip tests.

## Notes

`node_ids` persists as a JSON array string (serde_json added to the crate). WITHOUT ROWID on the two hash-keyed tables; the event log keeps rowid as its monotonic seq.
