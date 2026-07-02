---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S08'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Add CodeGraphCell beside the vault graph on ScopeCell: own LinkageGraph instance, own generation with swap-happens-before-bump, debounced fingerprint probe, lazy re-extract, honest stats snapshot

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

Add CodeGraphCell to ScopeCell: separate LinkageGraph instance, own generation (swap happens-before bump, SeqCst), 2s-debounced fingerprint probe, rebuild under a lock, band-validated edge ingest, stats snapshot.

## Outcome

Refresh is lazy on query (ADR D6 refinement recorded: query-time freshness instead of watching the whole source tree); vault watcher untouched.

## Notes
