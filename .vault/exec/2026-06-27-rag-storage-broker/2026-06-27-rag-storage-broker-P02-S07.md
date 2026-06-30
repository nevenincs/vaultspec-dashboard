---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S07'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Register the storage route in the router and the brokered ops namespace

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Registered `POST /ops/rag/storage/{verb}` → `ops_rag_storage` in the router and added the path to the documented route inventory.

## Outcome

The storage broker is wired into the engine's ops namespace as a 4-segment path, unambiguous against the 3-segment `/ops/rag/{verb}` (distinct matchit depths).

## Notes

The route sits next to the existing `/ops/rag/{verb}` registration; the vaultspec-api crate builds clean.
