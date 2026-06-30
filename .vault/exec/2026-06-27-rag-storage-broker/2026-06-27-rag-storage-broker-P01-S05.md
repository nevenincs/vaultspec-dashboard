---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S05'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added unit tests: the prefix guard (canonical accepted; uppercase/wrong-length/non-hex/flag/metachar rejected); `storage_args_for` per verb (delete/prune/migrate argv exact, dry-run-default vs apply, no `--allow-unknown`, migrate root is the passed cell root); the missing-prefix and bad-backend 400s; and `is_rag_envelope` + `storage_outcome` (would_remove exits 1 yet forwards, crash 502s, empty-on-exit-0 502s).

## Outcome

The primitives are regression-guarded: 5 storage tests plus the prefix test pass, cross-platform (no subprocess fixture). `cargo clippy -D warnings` and `cargo fmt --check` clean.

## Notes

No mocks; the argv assembly and outcome logic are pure and exercised directly with a real `build_state` AppState.
