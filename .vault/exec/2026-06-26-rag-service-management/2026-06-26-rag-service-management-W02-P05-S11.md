---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S11'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Add capability-and-version-gated Qdrant collection-info reads using names from storage survey, degrading honestly

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Add `CollectionHealth` (Qdrant-native status/points_count/indexed_vectors_count/segments_count/optimizer_status, all optional) + `read_collection_health(transport, collection)` reading Qdrant's documented `GET /collections/{name}` and `qdrant_collection_api_supported(version)` - the D6 capability gate that accepts a major-1 Qdrant and fails closed on an unknown major / no version, to `engine/crates/rag-client/src/vectors.rs`. 3 tests.
- Wire a `collection-health` brokered read verb (`engine/crates/vaultspec-api/src/routes/ops.rs`): validate the `collection` param as a single path segment, `probe_machine_state` for the live Qdrant version + port, gate via `qdrant_collection_api_supported` (degrade `supported:false` with the version stated on mismatch / rag-not-running), then read Qdrant directly on its loopback port and envelope it.

## Outcome

Done. The engine serves Tier-2 Qdrant-native health (the optimizer/segment/indexed signals rag does not expose) capability-gated on the Qdrant version, using a collection name supplied by the caller (sourced from the storage survey - never recomputed from rag's internal blake2b). `cargo test -p rag-client --lib vectors::` green (10); `cargo build -p vaultspec-api` green.

## Notes

The gate is intentionally lenient within Qdrant 1.x (the `GET /collections/{name}` REST shape is stable across the line) and the parse is tolerant of field drift - but fails closed on a major bump, which is exactly the silent-break D6 warns about. The collection name is validated to a conservative `[A-Za-z0-9_-]{1,256}` set as an injection guard on the Qdrant URL path.
