---
tags:
  - '#exec'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-27-rag-schema-gate-plan]]"
---

# Add the schema_version Option u64 field to HealthInfo and parse it from the /health body

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Added `schema_version: Option<u64>` (serde `default`) to the `HealthInfo` struct, documented as rag's bare storage-schema version - the cheapest pre-read gate, absent (`None`) in older rag builds.

## Outcome

The engine's `/health` parse now captures rag's bare schema version where present and tolerates its absence as `None`, so the running-probe already carries it for the cheap version gate.

## Notes

`#[serde(default)]` keeps an older rag's `/health` (no `schema_version`) parsing cleanly to `None`.
