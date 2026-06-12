---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S46'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the status verb reporting index state, backend health rollup and watcher state

## Scope

- `engine/crates/vaultspec-cli/src/cmd/status.rs`

## Description

- Implement the status verb: index state (vault presence, documents, nodes, edges, cache hits, store path), backend rollup (core invocation detection, rag truthful availability with reason), watcher state (one-shot: not running, by definition).

## Outcome

The recovery-snapshot family served from the CLI front door.

## Notes

None.
