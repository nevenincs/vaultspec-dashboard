---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Parse rag's structured failure envelope on a genuine non-zero exit and surface the stated reason, degrading to the re-probe otherwise

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `rag_start_failure` (parses rag's `{ok:false, error, data}` start envelope, returning the stated error + data) and wired it into the genuine-failure branch of `start_rag_service`: when present, the degraded envelope carries `rag_error` (e.g. `machine_owned`/`port_in_use`/`qdrant_missing`) and `rag_data` (e.g. the holder pid, the port) alongside the existing inferred `reason`.

## Outcome

A start failure surfaces rag's AUTHORITATIVE cause when the running rag supports `--json`, additively (the existing `needs_install` heuristic + inferred reason are unchanged); a non-envelope output degrades to today's inference.

## Notes

Surfaced as additive `rag_error`/`rag_data` fields rather than overriding the engine's own `status` vocabulary, to avoid conflating with the attach/`machine_owned` branch.
