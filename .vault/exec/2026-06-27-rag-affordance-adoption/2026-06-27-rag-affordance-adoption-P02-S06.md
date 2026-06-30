---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S06'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Unit-test the unknown-option detection and the structured-reason extraction over JSON fixtures

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added unit tests: `rag_start_args` appends `--json` after the validated flags (and still rejects a privileged port); `rag_rejected_json` detects the unknown-option error and not a genuine failure; `rag_start_failure` lifts the structured error+data and returns None for a success envelope or human text.

## Outcome

3 tests pass; the version-tolerant detection and the structured-reason extraction are regression-guarded over real JSON fixtures and a constructed `LifecycleRun`; clippy/fmt clean.

## Notes

The full async `start_rag_service` handler is not invoked (its probe needs a live rag); the pure helper tests cover the new logic, like the lifecycle handlers' existing coverage boundary.
