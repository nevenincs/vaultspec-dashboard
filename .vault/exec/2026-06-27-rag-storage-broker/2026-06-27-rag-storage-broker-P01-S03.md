---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply)

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added the `RagStorageBody` request struct (`prefix`, `to`, `apply` - all optional) and `storage_args_for`: assembles the validated argv per verb (validated prefix for delete; the engine-controlled active-cell root + `server|local` enum for migrate; prune takes no positional), then always appends `--yes` and adds `--dry-run` unless `apply: true`.
- Discovered and encoded rag's real flag contract: `--json` mode REQUIRES `--yes` (it means non-interactive; `_require_yes_for_json` exits 2 otherwise), so `--yes` is always passed and `--dry-run` is the preview switch - NOT the ADR's first guess of toggling `--yes`.

## Outcome

The destructive argv is assembled with validated, engine-controlled arguments and the correct dry-run-default flag combination; `--allow-unknown` is never assembled.

## Notes

The ADR D3 mechanism note was corrected during execution: preview = `--yes --dry-run`, apply = `--yes` (the runner appends `--json`), because rag's `--json` mandates `--yes`.
