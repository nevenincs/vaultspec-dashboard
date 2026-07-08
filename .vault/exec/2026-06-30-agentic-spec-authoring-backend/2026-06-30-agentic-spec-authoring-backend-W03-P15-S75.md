---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S75'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify changeset history reconstructs proposal state without LangGraph checkpoints or frontend memory

## Scope

- `engine/crates/vaultspec-api/src/authoring/ledger.rs`

## Description

- Verify append-only history reconstruction through real SQLite ledger tests.
- Verify restart reconstruction after dropping and reopening the authoring store.
- Verify serialized history contains no `langgraph` or `frontend_state` projection fields.
- Verify reconstruction rejects aggregate digest tampering, duplicated-column drift, and child revision-fence drift.

## Outcome

- Changeset history rebuilds proposal state from the durable revision rows plus ordered child operation rows.
- Reconstruction does not depend on LangGraph checkpoint memory or frontend state.
- Integrity checks fail loud when ledger JSON, normalized columns, target JSON, aggregate digest, or revision fences disagree.
- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 11 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 134 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
