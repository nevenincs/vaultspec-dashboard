---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S42'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the index verb, incremental by default with a full flag

## Scope

- `engine/crates/vaultspec-cli/src/cmd/index.rs`

## Description

- Implement the index verb: incremental by default (content-hash skip), `--full` forcing re-extraction via a new force path in the pipeline (converges per D8.2); reports documents/cache-hits/extracted/edges/nodes.

## Outcome

Live-verified: 101 documents, 101 cache hits on a warm run, 649 edges over this repository's own vault.

## Notes

The force path is a sibling entry point (`index_worktree_full`), not a parameter change - existing call sites untouched.
