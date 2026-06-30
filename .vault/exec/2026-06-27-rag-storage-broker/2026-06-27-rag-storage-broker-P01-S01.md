---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S01'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `RAG_STORAGE_CLI_WHITELIST` mapping `storage-delete`/`storage-prune`/`storage-migrate` to their fixed rag base args (`server storage <verb>`), in its own whitelist (separate from the lifecycle `RAG_CLI_WHITELIST`) because these take validated arguments and a destructive gate the lifecycle verbs do not.

## Outcome

The destructive storage verbs have a dedicated CLI whitelist; rag exposes them CLI-only, so they run on the bounded subprocess runner like the lifecycle verbs.

## Notes

None.
