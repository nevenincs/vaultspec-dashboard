---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Captured `health.schema_version` in the probe match (the handler previously dropped `health`), binding `(info, qdrant_version, schema_version)`.
- Applied the cheap stage-1 version gate (`storage_schema_version_supported(schema_version)`) immediately after the Qdrant capability gate, degrading through the existing `degraded_embeddings` closure on a newer version - before any `/readiness` round-trip.

## Outcome

A rag advertising a newer storage-schema version short-circuits to an honest degrade using the `/health` data the running-probe already fetched, adding zero round-trips on the fail-fast path.

## Notes

The reason string is produced by the gate (states the version drift); the handler forwards it verbatim, mirroring the Qdrant-capability-gate reason.
