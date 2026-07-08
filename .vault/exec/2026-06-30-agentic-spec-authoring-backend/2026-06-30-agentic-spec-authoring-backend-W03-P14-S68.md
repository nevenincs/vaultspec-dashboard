---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S68'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add validation tests for valid proposals, invalid frontmatter, stale chunks, changed base revision, warning-only status, and blocking failures

## Scope

- `engine/crates/vaultspec-api/src/authoring/validation.rs`

## Description

- Add real-behavior validation tests over temp vault documents, `SnapshotReader`, operation materialization, and SQLite `Store`.
- Cover valid proposals, digest stability, digest changes on target and reviewed diff material changes, preimage metadata mismatch, invalid frontmatter, warning-only missing chunk evidence, current and stale chunk evidence, changed base revision, latest-record tie ordering, and missing current revision observations.
- Cover submit-for-review eligibility for matching fresh digests, stale digests, missing validation records, and invalid validation records.
- Cover persistence and reload of validation records by digest and latest changeset lookup.
- Run the targeted validation test filter.

## Outcome

- `cargo test -p vaultspec-api authoring::validation -- --nocapture` passed with 15 validation tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 122 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.
- Tests use live code paths and persisted SQLite state; they do not mock, patch, skip, or mirror business logic.

## Notes

- The invalid frontmatter test asserts structural envelope failure only; core conformance remains a later adapter dependency.
- No destructive git operation was used.
