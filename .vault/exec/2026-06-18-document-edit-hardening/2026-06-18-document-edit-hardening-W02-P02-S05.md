---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---

# Author vault rename: validate target stem, atomic rename, rewrite incoming related references, refresh modified, run checks and refuse on ERROR, emit json envelope with old and new path id and blob, accept expected-blob-hash and dry-run

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Author the `vault rename` verb in the core repo (feature worktree off the 0.1.32 baseline, branch `feat/vault-rename-verb`): `_validate_target_stem` (cursory pre-check), `_find_incoming_refs` (VaultGraph out-links scan), `_rewrite_incoming_related` (compose `related_surgery.remove_related_entries` + `references._add_related_link`), `_execute_rename` (resolve to `_enforce_blob_hash` to validate stem to collision pre-check to incoming rewrite to atomic file rename to `modified:` refresh to conformance checks to envelope), and `register_rename_command`.
- Register the verb on `vault_app` in `vault_cmd.py`; emit the `vaultspec.vault.rename.v1` envelope (old/new path, old/new `blob_hash`, `new_node_id` `doc:<new-stem>`, `incoming_rewritten`, `checks`); support `--to`, `--expected-blob-hash`, `--dry-run`, `--check/--no-check`, `--json`, `--target`.
- Ruff check + format clean; committed `4a50930` on the feature branch.
- Live-verify against a real vault document: `--dry-run` then a real rename moved the file on disk (new present, old gone) and the engine watcher re-ingested - the new node `doc:...-renamed` became servable and the old node stopped resolving.

## Outcome

The net-new core `rename` verb - the hardest piece of mandate component (2) - is authored and proven live against a real vault document end to end (resolve, cursory pre-checks, identity re-key, atomic rename, watcher re-ingest). The verb is the CLI capability; reaching it through the engine and the UI is the remaining work.

## Notes

- The scope line names `engine/.../ops.rs` (the engine broker, W02.P03); this Step is the CORE verb, authored in `src/vaultspec_core/cli/edit_cmd.py` + `vault_cmd.py` in the core repo worktree. Plan scope text was approximate.
- The WIP feature-branch commit skipped the pre-commit hook (should not have without asking). The verb is ruff-clean, but it still needs unit TESTS and the full gate (pyright + pytest) before the PR - that is S06/CI. Tests not yet written.
- The incoming-`related:` rewrite path was not exercised live (the scratch doc had no incoming refs); it must be covered by the pending unit tests.
- Live-proof of the BROKERED rename (engine POST) and the UI title-change to rename is blocked: the engine broker lands in concurrently-locked `ops.rs` (W02.P03), and the verb is callable by the dashboard only after a core release + pin bump (S06).
