---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S02'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants

## Scope

- `engine/crates/rag-client/src/vectors.rs`

## Description

- Pinned `KNOWN_STORAGE_SCHEMA_VERSION = 1` and `EXPECTED_DENSE_DIM = 1024` as the engine's declared compatibility, documented as the storage-schema analog of the pinned Qdrant major.
- Added `DENSE_VECTOR_NAME = "dense"` (the name the scroll requests) as the gate's expected vector name.

## Outcome

The engine now declares what storage shape it understands; bumping these constants is a deliberate, reviewed "the engine now understands rag's new shape" change.

## Notes

The constants are reviewed code, never trusted live from rag - the engine declares its own support.
