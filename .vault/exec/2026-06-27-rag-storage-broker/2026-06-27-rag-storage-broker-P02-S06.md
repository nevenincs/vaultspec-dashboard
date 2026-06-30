---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added the `ops_rag_storage` route: looks the verb up in `RAG_STORAGE_CLI_WHITELIST` (403 if absent), takes the active cell, assembles the validated argv via `storage_args_for` (400 on a bad argument), and runs `run_storage_sibling_bounded` in the cell root, returning rag's envelope verbatim with the tiers block.

## Outcome

The destructive verbs are reachable through one validated, dry-run-default, tiers-honest route; a forbidden verb 403s and a malformed argument 400s before any subprocess.

## Notes

delete/prune are machine-scoped (no `project_root` derivation); migrate's root is the active cell, sourced inside `storage_args_for`.
