---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
body_hash: 'sha256:5d11537075634659f8ec6557a8f302ec06664e63e346693a55315826a50a6778'
step_id: 'S13'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement inventory adapters for vault list, vault stats and vault feature list JSON envelopes

## Scope

- `engine/crates/ingest-core/src/inventory.rs`

## Description

- Implement typed adapters for the three inventory envelopes: vault list (documents), vault stats (counts rollup), vault feature list (features with has-plan and earliest-date).
- Pin one schema constant per verb and export the supported sets crate-wide.

## Outcome

Inventory ingestion ready for the landscape (map verb) and the /status health passthrough.

## Notes

None.
