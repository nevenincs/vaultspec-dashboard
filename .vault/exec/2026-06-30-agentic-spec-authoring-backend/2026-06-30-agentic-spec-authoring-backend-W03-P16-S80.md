---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S80'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify every command uses the shared transition engine through tests and manual transition table review

## Scope

- `engine/crates/vaultspec-api/src/authoring/transitions.rs`

## Description

- Verify `command_lifecycle_scope` classifies every shared command vocabulary value.
- Verify lifecycle commands funnel through `transition_eligibility` and command-specific helpers rather than status-only predicates.
- Verify append-only ledger writes call `ledger_append_transition_blocker` before inserting a new aggregate revision.
- Verify V1 apply commands and ledger appends both enforce exactly one child operation during apply.
- Verify the reviewed child operation is preserved across apply start and completion.
- Verify staged multi-document apply statuses remain reserved and unreachable.

## Outcome

- `every_command_has_an_explicit_lifecycle_scope` covers every current `CommandKind` value.
- Manual transition-table review found no lifecycle command outside the shared transition helper.
- Ledger append validation uses the same transition engine as a persistence boundary backstop for command-handler bypasses.
- Real store regressions cover illegal lifecycle skips, multi-child apply start, reviewed multi-child narrowing, and apply completion child swaps.
- `cargo test -p vaultspec-api authoring::transitions -- --nocapture` passed with 10 transition tests.
- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 15 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 148 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- No proposal, approval, apply, rollback, session, stream, route, policy, or core adapter handlers exist in this phase; later command-handler phases must call the shared transition helper before appending ledger revisions.
- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
