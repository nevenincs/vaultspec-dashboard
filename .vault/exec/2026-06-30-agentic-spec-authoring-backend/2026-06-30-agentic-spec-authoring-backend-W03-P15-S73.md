---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S73'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add ledger tests for append-only revisions, child ordering, duplicate child rejection, multi-document changes, and history reconstruction

## Scope

- `engine/crates/vaultspec-api/src/authoring/ledger.rs`

## Description

- Add real SQLite ledger tests for append-only revisions and history reconstruction.
- Add child-ordering coverage proving request order is preserved instead of sorted by child key.
- Add duplicate child-key rejection coverage at record construction time.
- Add multi-document changeset coverage with existing and provisional document targets.
- Add restart reconstruction coverage so persisted ledger rows rebuild history without frontend or LangGraph state.
- Add stale previous-revision rejection coverage for append chain integrity.
- Add tamper coverage for aggregate digest drift, normalized revision-column drift, child-column drift, child-key whitespace, and child revision-fence drift.

## Outcome

- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 11 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 134 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.
- Tests use live store behavior and codebase value types; they do not mock, patch, skip, or mirror ledger logic.

## Notes

- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
