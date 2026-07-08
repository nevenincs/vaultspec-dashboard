---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S77'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement lifecycle transition rules, terminal-state validation, stale-state guards, and action eligibility helpers

## Scope

- `engine/crates/vaultspec-api/src/authoring/transitions.rs`
- `engine/crates/vaultspec-api/src/authoring/ledger.rs`

## Description

- Add `authoring::transitions` as a pure lifecycle decision module.
- Classify every command with an explicit lifecycle scope.
- Implement initial changeset status checks for authoring and rollback changesets.
- Implement status transition eligibility for review, approval, rejection, apply, cancellation, supersession, edit, response, and rebase decisions.
- Add stale validation and approval guard inputs for review and apply decisions.
- Enforce the V1 single-child apply restriction and reserve staged multi-document statuses.
- Add rollback source eligibility without mutating the applied source changeset.
- Add apply completion transitions from `applying` to applied, failed, or conflicted.
- Enforce legal adjacent lifecycle states at the append-only ledger boundary.
- Require reject decisions to pass the same reviewed-tuple freshness guards as approve decisions.
- Bind rollback eligibility to the actual applied source child key and operation.
- Preserve the reviewed child operation across ledger apply entry and completion while allowing each aggregate revision token to advance.

## Outcome

- Transition decisions now return backend-owned `ActionEligibility` values with concrete denial reasons.
- Terminal statuses refuse lifecycle mutation through the shared transition helper.
- `rollback_proposed` is constrained to rollback changesets and cannot become an authoring source status.
- `partially_applied` and `compensation_required` remain reserved and unreachable in V1.
- `cargo test -p vaultspec-api authoring::transitions -- --nocapture` passed with 10 transition tests.
- `cargo test -p vaultspec-api authoring::ledger -- --nocapture` passed with 15 ledger tests.
- `cargo test -p vaultspec-api authoring -- --nocapture` passed with 148 authoring tests.
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings` passed.

## Notes

- The module does not add handlers, storage, approval records, apply receipts, routes, streams, sessions, policy storage, or core adapter calls.
- The authoring-wide test run still prints existing temporary-workspace watcher and core graph warnings after the test result; the selected tests passed.
- No destructive git operation was used.
