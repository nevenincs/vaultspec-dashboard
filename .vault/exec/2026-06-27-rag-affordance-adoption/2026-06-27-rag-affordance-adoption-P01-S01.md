---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S01'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Prepend the storage-parent machine-global pointer to service_json_candidates and update the precedence comment

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Prepended rag's STATUS_DIR-independent machine pointer (`~/.vaultspec-rag/qdrant-server/service.json`, beside the lock) as the FIRST candidate in `service_json_candidates`, ahead of the STATUS_DIR-default file and the per-scope fallback.
- Updated the precedence comment to record that the previously-deferred STATUS_DIR-independent pointer is now adopted (the rag pointer shipped, coordination done).

## Outcome

Discovery survives a non-default rag STATUS_DIR by consulting the machine-global pointer first; purely additive (an absent pointer is skipped by `discover_at`).

## Notes

The `qdrant-server` subdir couples to rag's default storage layout, matching the existing hardcode of `.vaultspec-rag/service.json`.
