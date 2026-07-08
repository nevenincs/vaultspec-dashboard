---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S70'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify stale or invalid proposals cannot become approval-ready without a fresh validation digest

## Scope

- `engine/crates/vaultspec-api/src/authoring/validation.rs`

## Description

- Add an explicit approval-readiness regression for stale records with a matching digest and old records after revalidation.
- Verify `ValidationStatusRecord::is_fresh_for_review` only returns true for approval-ready statuses with the exact digest.
- Verify `submit_for_review_eligibility` denies stale records even when the caller names the stale record's own digest.
- Verify a prior valid record cannot be reused with a newer stale validation digest after the target base changes.
- Run focused validation, authoring-wide, and clippy verification after the freshness regression.

## Outcome

- Stale validation records cannot become approval-ready through matching digest alone.
- Old validation records cannot be reused after a fresh validation digest exists for changed material.
- `cargo test -p vaultspec-api authoring::validation -- --nocapture` passed with 16 validation tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 123 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
