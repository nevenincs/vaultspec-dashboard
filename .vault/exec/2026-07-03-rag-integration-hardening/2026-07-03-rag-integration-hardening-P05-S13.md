---
tags:
  - '#exec'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S13'
related:
  - "[[2026-07-03-rag-integration-hardening-plan]]"
---

# Extend the version-tolerant --json retry (exit-2 usage-error detection, plain retry) from server-start to the shared-runner lifecycle verbs server-status, server-doctor, and server-install

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `lifecycle_run_to_envelope` pure helper that converts a `LifecycleRun` to `Result<Value, String>`, matching the envelope shape `run_sibling` returns on success; extracted so the retry logic is unit-testable without spawning processes.
- Added `run_sibling_version_tolerant` async function that first runs the given verb with `--json`, detects rejection via the existing `rag_rejected_json` helper (exit-2 primary signal + unknown-option text scan), retries exactly once without `--json`, then delegates to `lifecycle_run_to_envelope`; non-zero exits that do not fire `rag_rejected_json` still surface as 502, preserving the `run_sibling` contract.
- Changed the `server-status | server-doctor | server-install` match arm from `run_sibling` to `run_sibling_version_tolerant`, closing the T1-R1 residual where a future rag dropping `--json` on these verbs would 502 loudly.
- Updated the match-arm comment to document the D5/T1-R1 closure and that the same version-tolerance now covers all lifecycle verbs.
- Added two unit tests: `lifecycle_run_to_envelope_converts_and_guards` (pure conversion logic — exit-0 JSON, exit-0 text wrap, non-zero Err) and `version_tolerant_retry_decision_reuses_rag_rejected_json` (documents that the retry predicate for status/doctor/install routes through the shared helper).

## Outcome

`cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test -p vaultspec-api` all exit 0. 324 unit tests pass. The new `lifecycle_run_to_envelope_converts_and_guards` and `version_tolerant_retry_decision_reuses_rag_rejected_json` tests are among them.

## Notes

Clippy flagged a needless `&state` borrow at the reprobe call site (added as part of S14 work in the same file); corrected to bare `state` before the final gate run.
