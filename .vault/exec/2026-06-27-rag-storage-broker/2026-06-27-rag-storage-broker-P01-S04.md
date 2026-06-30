---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `run_storage_sibling_bounded` (modeled on the write runner's spawn-bounds-kill lifecycle, no stdin, appends `--json`, 120s/8 MiB) and the pure helpers `is_rag_envelope` (top-level `ok` bool + `command` string) and `storage_outcome` (forward the envelope on any exit, 502 only an unparseable/empty stdout with a non-zero exit).
- Keyed the exit-1 forward on rag's `{ok, command}` envelope shape rather than the write runner's top-level `status` (rag's storage envelope nests `status` under `data`).

## Outcome

A `would_remove` preview (which exits 1) forwards verbatim as a business outcome instead of the lifecycle runner's 502 flattening (the original audit's C1); only a genuine spawn/timeout/crash degrades to a gateway error.

## Notes

The outcome decision was extracted into the pure `storage_outcome` so the load-bearing exit-1 logic is unit-tested without a cross-platform subprocess fixture (CI runs Windows + Linux).
