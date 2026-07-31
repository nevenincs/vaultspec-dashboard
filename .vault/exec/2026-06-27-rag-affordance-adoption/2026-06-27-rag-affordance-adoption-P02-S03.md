---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-07-12'
body_hash: 'sha256:388d219b77d95f8aa9853ae74cb7a1f4b3b57b5b8833e657e07a5eba2a729f78'
step_id: 'S03'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Append --json in rag_start_args

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Appended `--json` to `rag_start_args` (after the validated `--local-only`/`--port`/`--qdrant-auto-provision` flags) so the start requests rag's structured outcome.
- Updated the `LifecycleRun` doc comment (which claimed server start carries no --json) to describe the version-tolerant approach.

## Outcome

`server start` is invoked with `--json` so a non-zero exit can carry rag's stated reason; the validated flags still precede it (and the port bound still rejects a privileged port before --json is reached).

## Notes

The runner still appends no --json itself; the start caller owns the flag (so it can strip it on the version-tolerant retry).
