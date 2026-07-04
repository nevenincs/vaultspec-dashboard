---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S65'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify reviewers can inspect proposal material before apply through tests and manual diff fixture review

## Scope

- `engine/crates/vaultspec-api/src/authoring/operations.rs`

## Description

- Add a JSON inspection test proving review material exposes the changeset id, child key, operation kind, target snapshot, review diff hunk, and preimage reference before apply.
- Verify the review material does not expose or imply apply state.
- Inspect the operation module for the materialized proposal fields and the tests that exercise snapshot, diff, preimage, truncation, and unsupported-operation behavior.
- Run focused operation tests, authoring-wide tests, and clippy after the S65 verification test.

## Outcome

- `review_material_json_exposes_preview_diff_and_preimage_before_apply` verifies the reviewer-visible JSON shape.
- Focused operation tests passed with `cargo test -p vaultspec-api authoring::operations -- --nocapture`: 16 tests passed.
- Authoring-wide tests passed with `cargo test -p vaultspec-api authoring -- --nocapture`: 107 tests passed.
- Clippy passed with `cargo clippy -p vaultspec-api --all-targets -- -D warnings`.

## Notes

- An attempted Cargo invocation with multiple test-name filters failed because `cargo test` accepts one test filter. The full `authoring::operations` target was run successfully afterward and is the recorded verification.
- The authoring-wide test target emitted existing temporary-workspace watcher warnings from unrelated tests, but all selected tests passed.
- No destructive git operation was used.
