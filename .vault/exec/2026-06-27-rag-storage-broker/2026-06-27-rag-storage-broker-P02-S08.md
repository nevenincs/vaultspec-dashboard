---
tags:
  - '#exec'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-27-rag-storage-broker-plan]]"
---

# Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `storage_route_403s_unknown_verb_and_400s_a_bad_prefix_before_spawning` (a `#[tokio::test]`): calls `ops_rag_storage` directly with a built `AppState` and asserts an unknown verb returns 403 and a `storage-delete` with a malformed prefix returns 400 - both before any subprocess.

## Outcome

The route's pre-subprocess gates (whitelist 403, validation 400) are regression-guarded; the preview/apply argv paths are covered by the `storage_args_for` unit tests (the runner spawns the rag CLI, which is not present in the test environment).

## Notes

The route test asserts only the spawn-free paths; exercising the full spawn would need a live rag and is the no-mocks-mandate boundary, like the lifecycle verbs.
