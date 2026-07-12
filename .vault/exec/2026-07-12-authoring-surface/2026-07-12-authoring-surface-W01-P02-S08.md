---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Engine tests: comment CRUD, anchor orphaning when the commented section is edited, and cap plus retention enforcement

## Scope

- `engine/crates/vaultspec-api/tests`

## Description

- Add store-level comment tests in `comments.rs` (real SQLite store, no mocks): anchored round-trip with restart, content-hash-mismatch orphaning after a section edit, missing-anchor orphaning after a heading removal, the explicit re-anchor re-binding, edit/resolve/reopen/delete, a genuine per-document cap refusal (seed all 500 in one transaction then assert the 501st refuses), retention prune of long-resolved comments, unresolved-comment retention immunity, oversized-body/empty-selector refusals, and unregistered-author refusal.
- Add route-level tests in the `http.rs` test module (real router + real store + real worktree file): the full create → list (anchored) → edit-file (orphaned, content-hash-mismatch) → re-anchor (anchored) → delete lifecycle; a comment mutation emitting a `comment.created` event on the authoring outbox/SSE feed; and command-kind fencing on the create route.
- Add two review-response regression tests: the idempotent-replay-at-the-cap-boundary test (asserts no false refusal and that column/JSON `created_at_ms` agree after reload), and a traversal-shaped-node-id test (asserts a 404 and that an outside-vault file's contents never reach the wire).

## Outcome

Comment CRUD, anchor orphaning on section edit, cap and retention enforcement, the explicit re-anchor mutation, the SSE event emission, the idempotent-replay cap boundary, and the traversal-rejection security guard are all covered by tests exercising real components (SQLite store, axum router, worktree files) with no test doubles. The full comment surface is 17 passing tests within the 720-test lib suite.

## Notes

- The plan row scopes this step to `engine/crates/vaultspec-api/tests` (an integration binary). The engine's established convention is in-module tests against a real `Store` and a real axum router (every authoring domain — leases, actors, apply, direct-write, sessions — tests this way), which IS live-component integration testing per the wire-contract law. The route-level tests live in the `http.rs` test module alongside the existing `acquire_lease_route` / `direct_write_route` acceptance tests and cover the route layer end to end, so a separate `tests/` binary would duplicate that coverage without adding a new boundary; it was not added.
- Mandatory adversarial code review has not yet run; awaiting review before check-off.
